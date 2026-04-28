/**
 * TestStore - 测试验收状态管理
 *
 * 独立管理测试运行状态、结果、覆盖率等数据。
 */
import { create } from 'zustand'
import type {
  TestFrameworkInfo,
  TestStatus,
  TestSummary,
  TestResultItem
} from '../types/ipc'

interface TestStore {
  // 框架检测结果
  framework: TestFrameworkInfo | null
  detecting: boolean

  // 运行状态
  running: boolean
  sessionId: string | null
  outputBuffer: string

  // 结果
  results: TestResultItem[]
  summary: TestSummary | null
  status: TestStatus

  // 操作
  setFramework: (framework: TestFrameworkInfo | null) => void
  setDetecting: (detecting: boolean) => void
  setRunning: (running: boolean) => void
  setSessionId: (sessionId: string | null) => void
  appendOutput: (data: string) => void
  clearOutput: () => void
  setResults: (results: TestResultItem[]) => void
  setSummary: (summary: TestSummary | null) => void
  setStatus: (status: TestStatus) => void
  reset: () => void
}

const initialState = {
  framework: null,
  detecting: false,
  running: false,
  sessionId: null,
  outputBuffer: '',
  results: [],
  summary: null,
  status: 'idle' as TestStatus
}

export const useTestStore = create<TestStore>((set) => ({
  ...initialState,

  setFramework: (framework) => set({ framework }),
  setDetecting: (detecting) => set({ detecting }),
  setRunning: (running) => set({ running }),
  setSessionId: (sessionId) => set({ sessionId }),
  appendOutput: (data) => set((s) => ({ outputBuffer: s.outputBuffer + data })),
  clearOutput: () => set({ outputBuffer: '' }),
  setResults: (results) => set({ results }),
  setSummary: (summary) => set({ summary }),
  setStatus: (status) => set({ status }),
  reset: () => set(initialState)
}))