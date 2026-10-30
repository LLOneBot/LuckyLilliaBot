#!/usr/bin/env node
// Real built-Bot smoke test. No adapters, shared Bot data, or mock NativeQQ client.
// node script/native-debugger-smoke.mjs --uin 721011692 [--qq-path C:/QQ/QQ.exe]
// The token is read into memory from --auth-token-file (never an argv token).

import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const STABLE_MS = 10_000
const SHUTDOWN_MS = 45_000

class SmokeError extends Error {
  constructor(code) { super(code); this.code = code }
}
const check = (condition, code) => { if (!condition) throw new SmokeError(code) }
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const alive = pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}
const qqMainPids = () => {
  const command = "$OutputEncoding = [System.Text.UTF8Encoding]::new(); [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_Process -Filter \"Name='QQ.exe'\" | Where-Object { -not $_.CommandLine -or $_.CommandLine -notmatch '(^|\\s)--type=' } | ForEach-Object { [int]$_.ProcessId }) | ConvertTo-Json -Compress"
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 10_000 }).trim()
    const value = output ? JSON.parse(output) : []
    return (Array.isArray(value) ? value : [value]).filter(pid => Number.isSafeInteger(pid) && pid > 0)
  } catch { throw new SmokeError('BASELINE_QQ_ENUMERATION_FAILED') }
}

function options(argv) {
  const result = {
    uin: process.env.LLBOT_SMOKE_UIN || process.env.PMHQ_EXPECTED_UIN || '',
    dist: path.join(botRoot, 'dist'),
    tokenFile: path.resolve(botRoot, '../LuckyLillia.node/data/auth_token.txt'),
    qqPath: '', timeoutMs: 180_000, expectedBuildId: '', prepareOnly: false,
  }
  const names = new Map([
    ['--uin', 'uin'], ['-q', 'uin'], ['--dist', 'dist'], ['--auth-token-file', 'tokenFile'],
    ['--qq-path', 'qqPath'], ['--timeout-ms', 'timeoutMs'], ['--expected-build-id', 'expectedBuildId'],
  ])
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument === '--prepare-only') { result.prepareOnly = true; continue }
    const separator = argument.indexOf('=')
    const name = separator >= 0 ? argument.slice(0, separator) : argument
    const key = names.get(name)
    check(key, 'UNKNOWN_OPTION')
    const value = separator >= 0 ? argument.slice(separator + 1) : argv[++index]
    check(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 'MISSING_OPTION_VALUE')
    result[key] = value
  }
  check(/^[1-9][0-9]*$/.test(result.uin), 'EXPECTED_UIN_REQUIRED')
  result.timeoutMs = Number(result.timeoutMs)
  check(Number.isSafeInteger(result.timeoutMs) && result.timeoutMs >= 20_000 && result.timeoutMs <= 600_000, 'INVALID_TIMEOUT')
  for (const key of ['dist', 'tokenFile']) result[key] = path.resolve(result[key])
  if (result.qqPath) {
    result.qqPath = path.resolve(result.qqPath)
    check(existsSync(result.qqPath), 'QQ_EXECUTABLE_NOT_FOUND')
  }
  return result
}

function inspectNative(dist, expectedBuildId) {
  const bundleRoot = path.join(dist, 'native/lucky-lillia/production')
  check(existsSync(path.join(dist, 'llbot.js')), 'BUILT_BOT_NOT_FOUND')
  check(existsSync(path.join(bundleRoot, 'loader.cjs')), 'BUILT_NATIVE_LOADER_NOT_FOUND')
  const loader = require(path.join(bundleRoot, 'loader.cjs'))
  const bundle = loader.inspectBundle(bundleRoot)
  check(bundle.manifest.variant === 'production', 'NATIVE_VARIANT_NOT_PRODUCTION')
  check(bundle.target === 'win-x64', 'NATIVE_TARGET_NOT_WINDOWS_X64')
  if (expectedBuildId) check(bundle.metadata.buildId === expectedBuildId, 'NATIVE_BUILD_ID_MISMATCH')
  // Catch the common error of syncing the fixed addon but running an old dist/.
  const sourceRoot = path.join(botRoot, 'src/native/lucky-lillia/production')
  if (existsSync(path.join(sourceRoot, 'loader.cjs'))) {
    const source = require(path.join(sourceRoot, 'loader.cjs')).inspectBundle(sourceRoot)
    check(source.metadata.buildId === bundle.metadata.buildId, 'BUILT_NATIVE_IS_STALE')
  }
  return { buildId: bundle.metadata.buildId, target: bundle.target, version: bundle.metadata.package.version, variant: bundle.manifest.variant }
}

function prepareWorkspace(config) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'llbot-debugger-smoke-'))
  const instance = 'native-smoke'
  const instanceDir = path.join(directory, 'data/instances', instance)
  mkdirSync(instanceDir, { recursive: true })
  const nativeDir = path.join(directory, 'native-work')
  mkdirSync(nativeDir)
  const nativeConfig = path.join(directory, 'pmhq_config.json')
  const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
  // -q must cross the actual Bot argument parsing bridge. Do not duplicate the UIN here.
  json(nativeConfig, { hook_mode: 'debugger', work_dir: nativeDir, debug: false, debug_pb: false,
    ...(config.qqPath ? { qq_path: config.qqPath } : {}) })
  json(path.join(instanceDir, 'settings.json'), { log: false, logLevel: 'info',
    webui: { enable: false, host: '127.0.0.1', port: 0 }, msgCacheExpire: 120 })
  const optional = ['dashboard', 'logs', 'onebot11', 'satori', 'milky', 'qq-official', 'webqq', 'email-notification']
  json(path.join(instanceDir, 'plugins.json'), { version: 1, hmr: false, entries: [
    { id: 'smoke-nt', name: 'builtin:nt-protocol', config: { mode: 'pmhq', protocol: 'linux', pmhq: { configPath: nativeConfig, qqPath: config.qqPath } } },
    ...optional.map(name => ({ id: `smoke-${name}`, name: `builtin:${name}`, disabled: true })),
    // The host requires these core services. WebUI's listener is disabled above.
    { id: 'smoke-webui', name: 'builtin:webui' },
    { id: 'smoke-universal', name: 'builtin:ntqq-universal' },
  ] })
  return { directory, nativeConfig, instance, metadataLog: path.join(directory, 'smoke-metadata.jsonl') }
}

function ipc(endpoint, method, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint)
    const id = randomUUID()
    let buffer = ''
    let completed = false
    const finish = (error, value) => {
      if (completed) return
      completed = true
      clearTimeout(timer)
      socket.destroy()
      error ? reject(error) : resolve(value)
    }
    const timer = setTimeout(() => finish(new SmokeError('IPC_TIMEOUT')), timeoutMs)
    socket.setEncoding('utf8')
    socket.once('connect', () => socket.write(JSON.stringify({ type: 'request', id, method }) + '\n'))
    socket.once('error', () => finish(new SmokeError('IPC_UNAVAILABLE')))
    socket.once('close', () => finish(new SmokeError('IPC_CLOSED')))
    socket.on('data', chunk => {
      buffer += chunk
      if (buffer.length > 1024 * 1024) { finish(new SmokeError('IPC_RESPONSE_TOO_LARGE')); return }
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
        let response
        try { response = JSON.parse(line) } catch { finish(new SmokeError('IPC_INVALID_JSON')); return }
        if (response.type !== 'response' || response.id !== id) continue
        // Never include IPC error text: it can contain a native response or credentials.
        finish(response.error ? new SmokeError('IPC_METHOD_FAILED') : null, response.data)
        return
      }
    })
  })
}

function observeOutput(stream, token, observations) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', chunk => {
    observations.outputBytes += Buffer.byteLength(chunk)
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      // Buffer full lines before redaction so a token split across chunks is covered.
      const raw = buffer.slice(0, index); buffer = buffer.slice(index + 1)
      const line = raw.replaceAll(token, '[REDACTED]').replace(/\x1b\[[0-9;]*m/g, '')
      observations.outputLines++
      const marker = line.indexOf('getSelfNick -> ')
      if (marker >= 0) {
        try {
          const nickname = JSON.parse(line.slice(marker + 'getSelfNick -> '.length).trim())
          if (nonempty(nickname)) observations.fetchedNickname = nickname
        } catch { /* only the IPC identity may establish success */ }
      }
      if (line.includes('getSelfNick threw:')) observations.nicknameFailures++
      if (/unhandledRejection|uncaughtException/.test(line)) observations.hostExceptions++
      if (/\[E\]/.test(line)) observations.errorLines++
    }
    // Child output is classified in memory; no raw line is ever printed or saved.
    if (buffer.length > 1024 * 1024) { buffer = ''; observations.truncatedLines++ }
  })
}

function healthMetadata(health, login, observations) {
  return { sessionStatus: health.sessionStatus ?? null, status: health.status ?? null,
    qqPid: Number(health.qq_pid) || null, uin: health.uin == null ? null : String(health.uin),
    uidAvailable: nonempty(health.uid), loginState: login.state ?? null,
    loginUin: login.uin ?? null, nicknameAvailable: nonempty(login.nickname),
    nicknameFetchedByBot: nonempty(observations.fetchedNickname),
    authTokenSet: health.auth_token_set === true, failureAvailable: !!health.failure,
    historySize: Number(health.history_size) || 0, receivedSend: Number(health.received_send) || 0,
    receivedRecv: Number(health.received_recv) || 0 }
}

async function main() {
  const config = options(process.argv.slice(2))
  if (config.help) {
    console.log('Usage: node script/native-debugger-smoke.mjs --uin <QQ> [--qq-path <exe>] [--auth-token-file <file>] [--dist <dir>] [--expected-build-id <id>] [--timeout-ms <20000..600000>] [--prepare-only]\nUIN may also come from LLBOT_SMOKE_UIN or PMHQ_EXPECTED_UIN. Tests built dist/llbot.js, waits 10 seconds of stable identity, then shuts down Bot over IPC and retains QQ. Output contains metadata only.')
    return
  }
  check(process.platform === 'win32' && process.arch === 'x64', 'WINDOWS_X64_REQUIRED')
  const native = inspectNative(config.dist, config.expectedBuildId)
  const workspace = prepareWorkspace(config)
  const started = Date.now()
  const emit = (event, data = {}) => {
    const line = JSON.stringify({ event, elapsedMs: Date.now() - started, ...data })
    appendFileSync(workspace.metadataLog, line + '\n', 'utf8')
    console.log(line)
  }
  emit('prepared', { expectedUin: config.uin, native, workspace: workspace.directory, metadataLog: workspace.metadataLog, hookMode: 'debugger', adaptersEnabled: false, webuiListening: false })
  if (config.prepareOnly) return
  const baselineQqPids = qqMainPids()
  emit('baseline', { protectedQqPids: baselineQqPids })
  let token
  try { token = readFileSync(config.tokenFile, 'utf8').trim() } catch { throw new SmokeError('AUTH_TOKEN_FILE_UNREADABLE') }
  check(nonempty(token), 'AUTH_TOKEN_FILE_EMPTY')
  const pipeName = `llbot-debugger-smoke-${process.pid}-${randomUUID()}`
  const endpoint = `\\\\.\\pipe\\${pipeName}`
  const environment = { ...process.env }
  for (const name of Object.keys(environment)) {
    if (/^(NODE_OPTIONS|AUTH_TOKEN|LL_IPC_PIPE|LL_PARENT_PID|LLBOT_INSTANCE|LLBOT_WEBUI_.*|LLBOT_LOG_LEVEL|PROTOCOL_MODE|PROTOCOL)$/i.test(name)) delete environment[name]
  }
  Object.assign(environment, { AUTH_TOKEN: token, LL_IPC_PIPE: pipeName, LL_PARENT_PID: String(process.pid), LLBOT_LOG_LEVEL: 'info', NO_COLOR: '1' })
  const child = spawn(process.execPath, [path.join(config.dist, 'llbot.js'), '--instance', workspace.instance, '--pmhq', '--pmhq-config', workspace.nativeConfig, '-q', config.uin],
    { cwd: workspace.directory, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  // Retain the token only in the redactor closure and the already-spawned child's environment.
  delete environment.AUTH_TOKEN
  const observations = { outputBytes: 0, outputLines: 0, errorLines: 0, truncatedLines: 0, nicknameFailures: 0, hostExceptions: 0, fetchedNickname: '' }
  observeOutput(child.stdout, token, observations)
  observeOutput(child.stderr, token, observations)
  token = ''
  let exit
  const exited = new Promise(resolve => {
    child.once('error', () => { exit = { code: null, signal: null, spawnFailed: true }; resolve(exit) })
    child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit) })
  })
  let interrupted = false
  const interrupt = () => { interrupted = true }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  let failure
  let qqPid
  let baseline
  let stableSince
  let samples = 0
  let validated = false
  let lastMetadata
  emit('host_started', { hostPid: child.pid ?? null })
  try {
    while (Date.now() - started < config.timeoutMs) {
      check(!interrupted, 'INTERRUPTED')
      check(!exit, 'HOST_EXITED_BEFORE_VALIDATION')
      let health, login
      try { [health, login] = await Promise.all([ipc(endpoint, 'get_pmhq_health'), ipc(endpoint, 'get_login_state')]) }
      catch {
        check(stableSince === undefined, 'IPC_LOST_DURING_STABILITY_WINDOW')
        await delay(500); continue
      }
      lastMetadata = healthMetadata(health, login, observations)
      samples++
      if (lastMetadata.qqPid) qqPid = lastMetadata.qqPid
      emit('sample', lastMetadata)
      check(!qqPid || !baselineQqPids.includes(qqPid), 'NATIVE_REUSED_BASELINE_QQ')
      check(!health.failure && !['failed', 'stopped'].includes(health.sessionStatus), 'NATIVE_SESSION_FAILED')
      check(!health.uin || String(health.uin) === config.uin, 'HEALTH_UIN_MISMATCH')
      check(!login.uin || String(login.uin) === config.uin, 'LOGIN_UIN_MISMATCH')
      check(observations.hostExceptions === 0, 'HOST_UNHANDLED_EXCEPTION')
      const ready = health.sessionStatus === 'running' && String(health.uin) === config.uin && nonempty(health.uid)
        && login.state === 'logged_in' && String(login.uin) === config.uin && nonempty(login.nickname)
        && observations.fetchedNickname === login.nickname && lastMetadata.authTokenSet
        && lastMetadata.historySize > 0 && lastMetadata.receivedSend > 0 && lastMetadata.receivedRecv > 0 && alive(qqPid)
      if (stableSince !== undefined) {
        check(ready, 'IDENTITY_LOST_DURING_STABILITY_WINDOW')
        check(qqPid === baseline.qqPid && health.uid === baseline.uid, 'SESSION_CHANGED_DURING_STABILITY_WINDOW')
        check(lastMetadata.receivedSend >= baseline.send && lastMetadata.receivedRecv >= baseline.recv, 'CAPTURE_COUNTERS_RESET')
        if (Date.now() - stableSince >= STABLE_MS) {
          emit('validated', { ...lastMetadata, stableMs: Date.now() - stableSince, samples })
          validated = true
          break
        }
      } else if (ready) {
        stableSince = Date.now()
        baseline = { qqPid, uid: health.uid, send: lastMetadata.receivedSend, recv: lastMetadata.receivedRecv }
        emit('stability_started', { qqPid, uin: config.uin, uidAvailable: true, nicknameAvailable: true })
      }
      await delay(1000)
    }
    check(validated, 'LOGIN_OR_NICKNAME_TIMEOUT')
  } catch (error) { failure = error instanceof SmokeError ? error.code : 'UNEXPECTED_RUNNER_FAILURE' }
  finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
    if (!exit) {
      try {
        const response = await ipc(endpoint, 'shutdown', 10_000)
        check(response?.stopping === true, 'SHUTDOWN_NOT_ACKNOWLEDGED')
        emit('shutdown_requested', { hostPid: child.pid })
      } catch { failure ||= 'IPC_SHUTDOWN_FAILED' }
      await Promise.race([exited, delay(SHUTDOWN_MS, undefined, { ref: false })])
    }
    if (!exit) {
      failure ||= 'HOST_SHUTDOWN_TIMEOUT'
      // Do not TerminateProcess an attached debugger or kill the QQ tree. The
      // host's LL_PARENT_PID watcher will request disposal when this runner exits.
      child.stdout.destroy(); child.stderr.destroy(); child.unref()
    } else if (exit.code !== 0 || exit.signal || exit.spawnFailed) failure ||= 'HOST_EXIT_NOT_CLEAN'
    const qqRetained = alive(qqPid)
    if (!qqRetained) failure ||= 'QQ_NOT_RETAINED'
    const baselineQqRetained = baselineQqPids.every(alive)
    if (!baselineQqRetained) failure ||= 'BASELINE_QQ_EXITED'
    const { fetchedNickname, ...output } = observations
    emit(failure ? 'FAIL' : 'PASS', { reason: failure ?? null, hostPid: child.pid ?? null, exit: exit ?? null,
      qqPid: qqPid ?? null, qqRetained, protectedQqPids: baselineQqPids, baselineQqRetained, expectedUin: config.uin, uidAvailable: lastMetadata?.uidAvailable ?? false,
      nicknameAvailable: lastMetadata?.nicknameAvailable ?? false, native, output, metadataLog: workspace.metadataLog })
    if (failure) process.exitCode = 1
  }
}

main().catch(error => {
  // Deliberately omit native/OS error text, token-file contents, and child output.
  console.error(JSON.stringify({ event: 'FAIL', reason: error instanceof SmokeError ? error.code : 'PREFLIGHT_FAILED' }))
  process.exitCode = 1
})
