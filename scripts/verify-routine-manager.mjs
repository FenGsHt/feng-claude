// 纯函数验证（无 Electron 依赖）。运行：node scripts/verify-routine-manager.mjs
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as M from '../out/main/browserRoutineManagerStandalone.js'

let failures = 0
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++ } else { console.log('ok:', msg) } }

// extractParams
const r = { name: 'login', description: '', createdAt: '', steps: [
  { type: 'navigate', url: 'http://x/${env}/login' },
  { type: 'type', selector: '#u', value: '${username}' },
  { type: 'type', selector: '#p', value: '${password}' },
  { type: 'evaluate', js: 'return ${username}.length' }
]}
const params = M.extractParams(r)
assert(JSON.stringify(params) === JSON.stringify(['env','username','password']), 'extractParams unique ordered')

// substituteParams
assert(M.substituteParams('a${x}b${y}', { x: '1', y: '2' }) === 'a1b2', 'substituteParams replaces')
assert(M.substituteParams('a${x}', {}) === 'a', 'substituteParams missing -> empty')

// sanitizeName
assert(M.sanitizeName('a/b\\c .d') === 'a_b_c_.d', 'sanitizeName strips separators')

// persistence round-trip
const wd = mkdtempSync(join(tmpdir(), 'routine-'))
try {
  const path = M.saveRoutine(wd, r)
  assert(readFileSync(path, 'utf-8').includes('"login"'), 'saveRoutine writes file')
  const loaded = M.loadRoutine(wd, 'login')
  assert(loaded && loaded.steps.length === 4, 'loadRoutine reads back')
  const list = M.listRoutines(wd)
  assert(list.length === 1 && list[0].stepCount === 4 && list[0].params.length === 3, 'listRoutines summary')
  assert(M.deleteRoutine(wd, 'login') === true, 'deleteRoutine returns true')
  assert(M.loadRoutine(wd, 'login') === null, 'deleted gone')
  assert(M.deleteRoutine(wd, 'nope') === false, 'deleteRoutine missing -> false')
} finally { rmSync(wd, { recursive: true, force: true }) }

// resolveStep
const rs1 = M.resolveStep({ type: 'type', selector: '#u', value: '${username}' }, { username: 'admin' })
assert(rs1.value === 'admin' && rs1.selector === '#u', 'resolveStep substitutes value')
const rs2 = M.resolveStep({ type: 'navigate', url: 'http://x/${env}' }, {})
assert(rs2.url === 'http://x/', 'resolveStep missing param -> empty')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
