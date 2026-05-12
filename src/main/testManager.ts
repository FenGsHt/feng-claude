/**
 * TestManager - 独立的测试进程管理器
 *
 * 不依赖 Claude Code 会话，独立运行测试框架并解析结果。
 * 支持检测 vitest、jest、playwright、mocha 等框架。
 */
import * as pty from 'node-pty'
import { getWindowsPtySpawnExtras } from './winPtySpawnExtras'
import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type {
  TestFrameworkInfo,
  TestFrameworkName,
  TestOutputPayload,
  TestStatusPayload,
  TestSummary,
  TestResultItem,
  TestCoverage
} from '../renderer/src/types/ipc'

interface TestSession {
  id: string
  ptyProcess: pty.IPty | null
  workdir: string
  framework: TestFrameworkInfo
  buffer: string
  startTime: number
}

// 测试框架检测配置
const FRAMEWORK_CONFIGS: Record<TestFrameworkName, {
  configFiles: string[]
  packagePatterns: string[]
  command: string
  jsonReporterAvailable: boolean
}> = {
  vitest: {
    configFiles: ['vitest.config.ts', 'vitest.config.js', 'vite.config.ts', 'vite.config.js'],
    packagePatterns: ['vitest'],
    command: 'npx vitest run --reporter=json --reporter=default',
    jsonReporterAvailable: true
  },
  jest: {
    configFiles: ['jest.config.ts', 'jest.config.js', 'jest.config.json'],
    packagePatterns: ['jest'],
    command: 'npx jest --json --outputFile=.jest-results.json',
    jsonReporterAvailable: true
  },
  playwright: {
    configFiles: ['playwright.config.ts', 'playwright.config.js'],
    packagePatterns: ['@playwright/test'],
    command: 'npx playwright test --reporter=json',
    jsonReporterAvailable: true
  },
  mocha: {
    configFiles: ['.mocharc.json', '.mocharc.js', 'mocharc.json'],
    packagePatterns: ['mocha'],
    command: 'npx mocha --reporter json --reporter-option output=.mocha-results.json',
    jsonReporterAvailable: true
  },
  none: {
    configFiles: [],
    packagePatterns: [],
    command: '',
    jsonReporterAvailable: false
  }
}

export class TestManager {
  private sessions = new Map<string, TestSession>()
  private win: BrowserWindow

  constructor(win: BrowserWindow) {
    this.win = win
  }

  /**
   * 检测项目使用的测试框架
   */
  detectFramework(workdir: string): TestFrameworkInfo {
    // 读取 package.json
    const packageJsonPath = path.join(workdir, 'package.json')
    let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}

    if (fs.existsSync(packageJsonPath)) {
      try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      } catch {
        // ignore parse errors
      }
    }

    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies }

    // 按优先级检测框架
    const priority: TestFrameworkName[] = ['vitest', 'jest', 'playwright', 'mocha']

    for (const name of priority) {
      const config = FRAMEWORK_CONFIGS[name]
      if (!config) continue

      // 检查 package.json 中是否有该框架
      const hasPackage = config.packagePatterns.some(p => allDeps[p])
      if (!hasPackage) continue

      // 查找配置文件
      const configFile = config.configFiles.find(f => fs.existsSync(path.join(workdir, f)))

      return {
        name,
        configFile,
        testCommand: config.command,
        jsonReporterAvailable: config.jsonReporterAvailable
      }
    }

    return {
      name: 'none',
      testCommand: '',
      jsonReporterAvailable: false
    }
  }

  /**
   * 运行测试
   */
  runTest(sessionId: string, workdir: string, framework: TestFrameworkInfo): void {
    if (framework.name === 'none' || !framework.testCommand) {
      this.sendStatus(sessionId, 'error', undefined)
      return
    }

    // 创建 session
    const session: TestSession = {
      id: sessionId,
      ptyProcess: null,
      workdir,
      framework,
      buffer: '',
      startTime: Date.now()
    }
    this.sessions.set(sessionId, session)

    // 发送运行状态
    this.sendStatus(sessionId, 'running', undefined)

    // 创建 PTY 进程
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash'
    const args = process.platform === 'win32' ? ['/c', framework.testCommand] : ['-c', framework.testCommand]

    try {
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: workdir,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NO_COLOR: '1',
          CI: 'true'
        },
        ...getWindowsPtySpawnExtras()
      })

      session.ptyProcess = ptyProcess

      // 收集输出
      ptyProcess.onData((data: string) => {
        if (this.win.isDestroyed()) return
        session.buffer += data

        // 发送实时输出
        this.win.webContents.send(IPC.TEST_OUTPUT, {
          sessionId,
          data,
          timestamp: Date.now()
        } as TestOutputPayload)
      })

      // 处理退出
      ptyProcess.onExit(({ exitCode }) => {
        const summary = this.parseTestResults(session, exitCode)
        const status: 'passed' | 'failed' | 'error' = exitCode === 0 ? 'passed' : 'failed'

        this.sendStatus(sessionId, status, summary)
        this.sessions.delete(sessionId)
      })
    } catch (err) {
      this.sendStatus(sessionId, 'error', undefined)
      this.sessions.delete(sessionId)
    }
  }

  /**
   * 取消测试
   */
  cancelTest(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.ptyProcess) {
      session.ptyProcess.kill()
      this.sessions.delete(sessionId)
      this.sendStatus(sessionId, 'cancelled', undefined)
    }
  }

  /**
   * 解析测试结果
   */
  private parseTestResults(session: TestSession, exitCode: number): TestSummary {
    const framework = session.framework.name
    let results: TestResultItem[] = []
    let coverage: TestCoverage | undefined

    // 尝试解析 JSON 输出
    try {
      if (framework === 'vitest') {
        results = this.parseVitestOutput(session.buffer)
      } else if (framework === 'jest') {
        // Jest 写入文件，需要读取
        const resultFile = path.join(session.workdir, '.jest-results.json')
        if (fs.existsSync(resultFile)) {
          const jestData = JSON.parse(fs.readFileSync(resultFile, 'utf-8'))
          results = this.parseJestOutput(jestData)
        }
      } else if (framework === 'playwright') {
        results = this.parsePlaywrightOutput(session.buffer)
      } else if (framework === 'mocha') {
        const resultFile = path.join(session.workdir, '.mocha-results.json')
        if (fs.existsSync(resultFile)) {
          const mochaData = JSON.parse(fs.readFileSync(resultFile, 'utf-8'))
          results = this.parseMochaOutput(mochaData)
        }
      }

      // 尝试读取覆盖率报告
      coverage = this.readCoverageReport(session.workdir)
    } catch {
      // 解析失败，使用基础统计
    }

    // 计算汇总
    const passed = results.filter(r => r.status === 'passed').length
    const failed = results.filter(r => r.status === 'failed').length
    const skipped = results.filter(r => r.status === 'skipped').length

    return {
      total: results.length,
      passed,
      failed,
      skipped,
      duration: Date.now() - session.startTime,
      coverage
    }
  }

  /**
   * 解析 Vitest JSON 输出
   */
  private parseVitestOutput(buffer: string): TestResultItem[] {
    // Vitest JSON 输出格式
    try {
      const lines = buffer.split('\n').filter(l => l.startsWith('{') && l.endsWith('}'))
      const results: TestResultItem[] = []

      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          if (obj.type === 'test' && obj.name) {
            results.push({
              name: obj.name,
              status: obj.status === 'passed' ? 'passed' : obj.status === 'failed' ? 'failed' : 'skipped',
              duration: obj.duration ?? 0,
              error: obj.errors?.[0]?.message,
              file: obj.file?.path,
              line: obj.file?.line
            })
          }
        } catch {
          // ignore parse errors per line
        }
      }

      return results
    } catch {
      return []
    }
  }

  /**
   * 解析 Jest JSON 输出
   */
  private parseJestOutput(data: Record<string, unknown>): TestResultItem[] {
    const results: TestResultItem[] = []
    const testResults = (data.testResults as Array<Record<string, unknown>>) ?? []

    for (const testFile of testResults) {
      const assertions = (testFile.assertionResults as Array<Record<string, unknown>>) ?? []
      for (const assertion of assertions) {
        results.push({
          name: (assertion.fullName as string) ?? (assertion.title as string) ?? '',
          status: (assertion.status as string) === 'passed' ? 'passed' : 'failed',
          duration: (assertion.duration as number) ?? 0,
          error: (assertion.failureMessages as string[])?.join('\n'),
          file: testFile.name as string
        })
      }
    }

    return results
  }

  /**
   * 解析 Playwright JSON 输出
   */
  private parsePlaywrightOutput(buffer: string): TestResultItem[] {
    try {
      // Playwright 输出在最后一段包含 JSON
      const jsonMatch = buffer.match(/\{[\s\S]*"suites"[\s\S]*\}/)
      if (!jsonMatch) return []

      const data = JSON.parse(jsonMatch[0])
      const results: TestResultItem[] = []

      const walkSuites = (suites: Array<Record<string, unknown>>): void => {
        for (const suite of suites) {
          const specs = (suite.specs as Array<Record<string, unknown>>) ?? []
          for (const spec of specs) {
            const tests = (spec.tests as Array<Record<string, unknown>>) ?? []
            for (const test of tests) {
              results.push({
                name: (spec.title as string) ?? '',
                status: (test.status as string) === 'passed' ? 'passed' : 'failed',
                duration: (test.duration as number) ?? 0,
                error: (test.error as string),
                file: suite.file as string,
                line: spec.line as number
              })
            }
          }
          if (suite.suites) walkSuites(suite.suites as Array<Record<string, unknown>>)
        }
      }

      walkSuites((data.suites as Array<Record<string, unknown>>) ?? [])
      return results
    } catch {
      return []
    }
  }

  /**
   * 解析 Mocha JSON 输出
   */
  private parseMochaOutput(data: Record<string, unknown>): TestResultItem[] {
    const results: TestResultItem[] = []
    const tests = (data.tests as Array<Record<string, unknown>>) ?? []
    const failures = (data.failures as Array<Record<string, unknown>>) ?? []
    const pending = (data.pending as Array<Record<string, unknown>>) ?? []

    for (const test of tests) {
      results.push({
        name: (test.fullTitle as string) ?? (test.title as string) ?? '',
        status: 'passed',
        duration: (test.duration as number) ?? 0,
        file: test.file as string
      })
    }

    for (const failure of failures) {
      results.push({
        name: (failure.fullTitle as string) ?? (failure.title as string) ?? '',
        status: 'failed',
        duration: (failure.duration as number) ?? 0,
        error: (failure.err as Record<string, unknown>)?.message as string,
        file: failure.file as string
      })
    }

    for (const pendingTest of pending) {
      results.push({
        name: (pendingTest.fullTitle as string) ?? (pendingTest.title as string) ?? '',
        status: 'skipped',
        duration: 0,
        file: pendingTest.file as string
      })
    }

    return results
  }

  /**
   * 读取覆盖率报告
   */
  private readCoverageReport(workdir: string): TestCoverage | undefined {
    const coveragePaths = [
      path.join(workdir, 'coverage', 'coverage-summary.json'),
      path.join(workdir, 'coverage', 'coverage-final.json'),
      path.join(workdir, '.nyc_output', 'coverage-summary.json')
    ]

    for (const coveragePath of coveragePaths) {
      if (fs.existsSync(coveragePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'))
          const total = data.total ?? data

          return {
            lines: Math.round((total.lines?.pct ?? 0) * 100) / 100,
            branches: Math.round((total.branches?.pct ?? 0) * 100) / 100,
            functions: Math.round((total.functions?.pct ?? 0) * 100) / 100,
            statements: Math.round((total.statements?.pct ?? 0) * 100) / 100
          }
        } catch {
          // ignore
        }
      }
    }

    return undefined
  }

  /**
   * 发送状态到渲染进程
   */
  private sendStatus(sessionId: string, status: 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error', summary?: TestSummary): void {
    if (this.win.isDestroyed()) return
    this.win.webContents.send(IPC.TEST_STATUS, {
      sessionId,
      status,
      summary
    } as TestStatusPayload)
  }
}