#!/usr/bin/env node
// Real production Bot/direct/sign smoke, with a private copy of one saved session.
// node script/sign-smoke.mjs --uin 721011692 --protocol linux [--prepare-only]
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const STABLE_MS = 10_000
class SmokeError extends Error { constructor(code) { super(code); this.code = code } }
const check = (condition, code) => { if (!condition) throw new SmokeError(code) }
const nonempty = value => typeof value === 'string' && !!value.trim()
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')

function options(argv) {
  const config = { uin: process.env.LLBOT_SMOKE_UIN || '', protocol: 'linux', dataDir: path.join(botRoot, 'data'),
    tokenFile: '', dist: path.join(botRoot, 'dist'), timeoutMs: 90_000, prepareOnly: false, expectedBuildId: '' }
  const names = new Map([['--uin', 'uin'], ['-q', 'uin'], ['--protocol', 'protocol'], ['--data-dir', 'dataDir'],
    ['--auth-token-file', 'tokenFile'], ['--dist', 'dist'], ['--timeout-ms', 'timeoutMs'], ['--expected-build-id', 'expectedBuildId']])
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument === '--prepare-only') { config.prepareOnly = true; continue }
    const separator = argument.indexOf('=')
    const key = names.get(separator < 0 ? argument : argument.slice(0, separator))
    check(key, 'UNKNOWN_OPTION')
    const value = separator < 0 ? argv[++index] : argument.slice(separator + 1)
    check(nonempty(value) && !value.startsWith('--'), 'MISSING_OPTION_VALUE')
    config[key] = value
  }
  check(/^[1-9][0-9]*$/.test(config.uin), 'EXPECTED_UIN_REQUIRED')
  check(['linux', 'macos'].includes(config.protocol), 'UNSUPPORTED_PROTOCOL')
  config.dataDir = path.resolve(config.dataDir)
  config.dist = path.resolve(config.dist)
  config.tokenFile = path.resolve(config.tokenFile || path.join(config.dataDir, 'auth_token.txt'))
  config.timeoutMs = Number(config.timeoutMs)
  check(Number.isSafeInteger(config.timeoutMs) && config.timeoutMs >= 20_000 && config.timeoutMs <= 600_000, 'INVALID_TIMEOUT')
  return config
}

function inspectNative(config) {
  check(existsSync(path.join(config.dist, 'llbot.js')), 'BUILT_BOT_NOT_FOUND')
  const root = path.join(config.dist, 'native/lucky-lillia/production')
  const loaderPath = path.join(root, 'loader.cjs')
  check(existsSync(loaderPath), 'BUILT_NATIVE_LOADER_NOT_FOUND')
  const bundle = require(loaderPath).inspectBundle(root)
  check(bundle.manifest.variant === 'production', 'NATIVE_VARIANT_NOT_PRODUCTION')
  if (config.expectedBuildId) check(bundle.metadata.buildId === config.expectedBuildId, 'NATIVE_BUILD_ID_MISMATCH')
  const sourceRoot = path.join(botRoot, 'src/native/lucky-lillia/production')
  if (existsSync(path.join(sourceRoot, 'loader.cjs'))) {
    const source = require(path.join(sourceRoot, 'loader.cjs')).inspectBundle(sourceRoot)
    check(source.metadata.buildId === bundle.metadata.buildId, 'BUILT_NATIVE_IS_STALE')
  }
  return { loaderPath, build: { buildId: bundle.metadata.buildId, target: bundle.target, version: bundle.metadata.package.version, variant: bundle.manifest.variant } }
}

function prepare(config) {
  const suffix = config.protocol === 'linux' ? '' : '-macos'
  const sessionName = `qq-session-${config.uin}${suffix}.json`
  const sourceFiles = [sessionName, 'machine_guid.bin']
  if (config.protocol === 'macos') check(existsSync(path.join(config.dataDir, 'macos_device.json')), 'MACOS_DEVICE_FILE_REQUIRED')
  if (existsSync(path.join(config.dataDir, 'macos_device.json'))) sourceFiles.push('macos_device.json')
  const originals = sourceFiles.map(name => {
    const file = path.join(config.dataDir, name)
    check(existsSync(file), 'SESSION_OR_DEVICE_FILE_MISSING')
    const bytes = readFileSync(file)
    return { name, file, bytes, digest: hash(bytes) }
  })
  const session = JSON.parse(originals[0].bytes.toString('utf8'))
  check(String(session.uin) === config.uin && nonempty(session.uid) && nonempty(session.enc), 'INVALID_ENCRYPTED_SESSION')
  check(originals.find(file => file.name === 'machine_guid.bin').bytes.length === 16, 'INVALID_MACHINE_GUID')
  const directory = mkdtempSync(path.join(os.tmpdir(), `llbot-sign-smoke-${config.protocol}-`))
  const dataDir = path.join(directory, 'data')
  const instance = 'sign-smoke'
  const instanceDir = path.join(dataDir, 'instances', instance)
  mkdirSync(instanceDir, { recursive: true })
  for (const original of originals) writeFileSync(path.join(dataDir, original.name), original.bytes)
  // A cached nickname would skip getSelfNick's network query. Only change our copy.
  json(path.join(dataDir, sessionName), { ...session, nick: '' })
  const webuiPassword = randomBytes(32).toString('hex')
  writeFileSync(path.join(instanceDir, 'webui_token.txt'), webuiPassword, 'utf8')
  json(path.join(instanceDir, 'settings.json'), { log: false, logLevel: 'info', msgCacheExpire: 120, webui: { enable: true, host: '127.0.0.1', port: 0 } })
  const optional = ['dashboard', 'logs', 'onebot11', 'satori', 'milky', 'qq-official', 'webqq', 'email-notification']
  json(path.join(instanceDir, 'plugins.json'), { version: 1, hmr: false, entries: [
    { id: 'smoke-nt', name: 'builtin:nt-protocol', config: { mode: 'direct', protocol: config.protocol, nativeQQ: { qqPath: '' } } },
    ...optional.map(name => ({ id: `smoke-${name}`, name: `builtin:${name}`, disabled: true })),
    { id: 'smoke-webui', name: 'builtin:webui' }, { id: 'smoke-universal', name: 'builtin:ntqq-universal' },
  ] })
  return { directory, instance, originals, expectedUid: session.uid, webuiHash: hash(webuiPassword),
    metadataLog: path.join(directory, 'sign-smoke-metadata.jsonl') }
}

// The Bot disposes itself once its LL_PARENT_PID is gone. The keeper stands in as that parent and goes with the
// runner, so ending it asks for a clean shutdown where a signal would terminate the Bot outright (Windows)
function startKeeper() {
  const keeper = spawn(process.execPath, ['-e', `setInterval(() => { try { process.kill(${process.pid}, 0) } catch (error) { if (error.code === 'ESRCH') process.exit() } }, 1000)`],
    { stdio: 'ignore', windowsHide: true })
  keeper.once('error', () => {})
  keeper.unref()
  check(keeper.pid, 'KEEPER_SPAWN_FAILED')
  return keeper
}

function observeOutput(stream, token, prefix, state, emit) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', chunk => {
    state.outputBytes += Buffer.byteLength(chunk)
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, index); buffer = buffer.slice(index + 1)
      const line = raw.replaceAll(token, '[REDACTED]').replace(/\x1b\[[0-9;]*m/g, '')
      state.outputLines++
      const probeAt = line.indexOf(prefix)
      if (probeAt >= 0) {
        try {
          const entry = JSON.parse(line.slice(probeAt + prefix.length))
          if (entry.event === 'probe_ready') state.probeReady = true
          if (entry.event === 'native_loaded') { state.nativeLoads++; state.buildId = entry.buildId }
          if (entry.event === 'NativeQQ_construct') state.nativeQQConstructions++
          if (entry.event === 'init_call') state.initCalls++
          if (entry.event === 'init_success') state.initSuccess++
          if (entry.event === 'signRequest_call') state.signCalls++
          if (entry.event === 'signRequest_success') {
            state.signSuccess++
            if (entry.buffers && entry.signLength > 0 && entry.tokenLength > 0 && entry.extraLength > 0) state.completeSignSuccess++
          }
          if (entry.event.endsWith('_failure')) state.categories.add(entry.category || 'PROBE_FAILURE')
          // The probe itself emits only this fixed metadata schema; still whitelist.
          const safe = {}
          for (const key of ['event', 'buildId', 'variant', 'target', 'cmd', 'seq', 'buffers', 'signLength', 'tokenLength', 'extraLength', 'category', 'nativeQQAvailable', 'nativeQQConstructions']) {
            if (entry[key] !== undefined) safe[key] = entry[key]
          }
          emit('native_probe', safe)
        } catch { state.categories.add('PROBE_INVALID_METADATA') }
        continue
      }
      const port = /Webui 服务器已启动 127\.0\.0\.1:(\d+)/.exec(line)
      if (port) state.webuiPort = Number(port[1])
      const marker = line.indexOf('getSelfNick -> ')
      if (marker >= 0) {
        try { const nick = JSON.parse(line.slice(marker + 15).trim()); if (nonempty(nick)) state.nickname = nick } catch {}
      }
      if (/Saved session expired|QQ session expired|session 已失效|session-expired/.test(line)) state.categories.add('SESSION_EXPIRED')
      if (/getSelfNick threw:/.test(line)) state.categories.add('NICKNAME_LOOKUP_FAILED')
      if (/auth_token 无效|auth_token.*无权限|Sign.*(?:401|403)/i.test(line)) state.categories.add('AUTH_REJECTED')
      if (/auth_token 校验网络失败|ECONN|ENOTFOUND|timed out|timeout/i.test(line)) state.categories.add('NETWORK_ERROR')
      if (/unhandledRejection|uncaughtException/.test(line)) state.categories.add('HOST_UNHANDLED_EXCEPTION')
    }
    if (buffer.length > 1024 * 1024) { buffer = ''; state.categories.add('OUTPUT_LINE_TRUNCATED') }
  })
}

async function main() {
  const config = options(process.argv.slice(2))
  if (config.help) {
    console.log('Usage: node script/sign-smoke.mjs --uin <QQ> --protocol linux|macos [--data-dir <Bot/data>] [--auth-token-file <file>] [--dist <dir>] [--expected-build-id <id>] [--timeout-ms <ms>] [--prepare-only]\nRuns the built production Bot in direct mode with a private session copy, observes real native init/signRequest calls, checks runtime UID through localhost /api/login-info and a fresh nickname query, then ends its parent so the Bot shuts itself down. Default timeout: 90 seconds. No raw credentials, signature bytes, UID, nickname, or packet body are printed.')
    return
  }
  const native = inspectNative(config)
  const workspace = prepare(config)
  const started = Date.now()
  const emit = (event, data = {}) => {
    const line = JSON.stringify({ event, elapsedMs: Date.now() - started, ...data })
    appendFileSync(workspace.metadataLog, line + '\n', 'utf8'); console.log(line)
  }
  emit('prepared', { expectedUin: config.uin, protocol: config.protocol, mode: 'direct', native: native.build,
    copiedFiles: workspace.originals.map(file => file.name), copiedNicknameCleared: true, workspace: workspace.directory,
    metadataLog: workspace.metadataLog, uidSource: 'Bot /api/login-info selfInfo.uid restored from encrypted session; online and nickname verified against live QQ requests', adaptersEnabled: false })
  if (config.prepareOnly) return
  let token
  try { token = readFileSync(config.tokenFile, 'utf8').trim() } catch { throw new SmokeError('AUTH_TOKEN_FILE_UNREADABLE') }
  check(nonempty(token), 'AUTH_TOKEN_FILE_EMPTY')
  const keeper = startKeeper()
  const nonce = randomBytes(16).toString('hex')
  const prefix = `@@LLBOT_SIGN_SMOKE:${nonce}@@`
  const environment = { ...process.env }
  for (const name of Object.keys(environment)) {
    if (/^(NODE_OPTIONS|AUTH_TOKEN|LL_PARENT_PID|LLBOT_INSTANCE|LLBOT_WEBUI_.*|LLBOT_LOG_LEVEL|PROTOCOL_MODE|PROTOCOL|LLBOT_SIGN_SMOKE_.*)$/i.test(name)) delete environment[name]
  }
  Object.assign(environment, { AUTH_TOKEN: token, LL_PARENT_PID: String(keeper.pid), LLBOT_LOG_LEVEL: 'info', NO_COLOR: '1',
    LLBOT_SIGN_SMOKE_LOADER: native.loaderPath, LLBOT_SIGN_SMOKE_NONCE: nonce })
  const child = spawn(process.execPath, ['--require', path.join(botRoot, 'script/sign-smoke-probe.cjs'), path.join(config.dist, 'llbot.js'),
    '--instance', workspace.instance, '--protocol', config.protocol, '-q', config.uin],
  { cwd: workspace.directory, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  delete environment.AUTH_TOKEN
  const state = { outputBytes: 0, outputLines: 0, probeReady: false, nativeLoads: 0, nativeQQConstructions: 0,
    initCalls: 0, initSuccess: 0, signCalls: 0, signSuccess: 0, completeSignSuccess: 0, buildId: '', webuiPort: 0, nickname: '', categories: new Set() }
  observeOutput(child.stdout, token, prefix, state, emit)
  observeOutput(child.stderr, token, prefix, state, emit)
  token = ''
  let exit, failure, stableSince, lastLoginInfo, validated = false, interrupted = false
  const exited = new Promise(resolve => {
    child.once('error', () => { exit = { code: null, signal: null, spawnFailed: true }; resolve(exit) })
    child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit) })
  })
  const interrupt = () => { interrupted = true }
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
  emit('host_started', { hostPid: child.pid ?? null })
  try {
    while (Date.now() - started < config.timeoutMs) {
      check(!interrupted, 'INTERRUPTED')
      check(!exit, 'HOST_EXITED_BEFORE_VALIDATION')
      check(state.nativeQQConstructions === 0, 'UNEXPECTED_NATIVE_QQ_CONSTRUCTION')
      check(!state.categories.has('SESSION_EXPIRED'), 'SESSION_EXPIRED')
      check(!state.categories.has('HOST_UNHANDLED_EXCEPTION'), 'HOST_UNHANDLED_EXCEPTION')
      let info
      try {
        if (state.webuiPort) {
          const response = await fetch(`http://127.0.0.1:${state.webuiPort}/api/login-info`, {
            headers: { 'X-Webui-Token': workspace.webuiHash }, signal: AbortSignal.timeout(5_000) })
          check(response.ok, 'WEBUI_LOGIN_INFO_HTTP_ERROR')
          const body = await response.json()
          check(body.success && body.data, 'WEBUI_LOGIN_INFO_INVALID')
          info = body.data
        }
      } catch {
        check(stableSince === undefined, 'CONTROL_CHANNEL_LOST_DURING_STABILITY_WINDOW')
        await delay(500); continue
      }
      if (!info) { await delay(500); continue }
      lastLoginInfo = info
      check(info.mode === 'direct' && info.protocol === config.protocol, 'PROTOCOL_MODE_MISMATCH')
      check(!info.uin || String(info.uin) === config.uin, 'RUNTIME_UIN_MISMATCH')
      const ready = info.online === true && String(info.uin) === config.uin && nonempty(info.uid) && info.uid === workspace.expectedUid
        && nonempty(info.nick) && info.nick === state.nickname && state.probeReady
        && state.buildId === native.build.buildId && state.initSuccess > 0 && state.completeSignSuccess > 0
      emit('sample', { mode: info.mode, protocol: info.protocol, online: info.online === true, uin: info.uin || null,
        uidAvailable: nonempty(info.uid), uidMatchesSession: info.uid === workspace.expectedUid,
        nicknameAvailable: nonempty(info.nick), freshNicknameFetched: nonempty(state.nickname), initSuccess: state.initSuccess,
        signCalls: state.signCalls, signSuccess: state.signSuccess, completeSignSuccess: state.completeSignSuccess, nativeQQConstructions: state.nativeQQConstructions, categories: [...state.categories] })
      if (stableSince !== undefined) {
        check(ready, 'DIRECT_SESSION_LOST_DURING_STABILITY_WINDOW')
        if (Date.now() - stableSince >= STABLE_MS) { validated = true; break }
      } else if (ready) { stableSince = Date.now(); emit('stability_started', { stableMsRequired: STABLE_MS }) }
      await delay(1000)
    }
    check(validated, 'SIGN_OR_LOGIN_OR_NICKNAME_TIMEOUT')
  } catch (error) { failure = error instanceof SmokeError ? error.code : 'UNEXPECTED_RUNNER_FAILURE' }
  finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
    keeper.kill()
    if (!exit) {
      emit('shutdown_requested')
      await Promise.race([exited, delay(30_000, undefined, { ref: false })])
    }
    if (!exit) {
      failure ||= 'HOST_SHUTDOWN_TIMEOUT'
      child.stdout.destroy(); child.stderr.destroy(); child.unref()
    } else if (exit.code !== 0 || exit.signal || exit.spawnFailed) failure ||= 'HOST_EXIT_NOT_CLEAN'
    const sourcesUnchanged = workspace.originals.every(original => {
      try { return hash(readFileSync(original.file)) === original.digest } catch { return false }
    })
    if (!sourcesUnchanged) failure ||= 'SOURCE_SESSION_OR_DEVICE_CHANGED'
    if (state.nativeQQConstructions !== 0) failure ||= 'UNEXPECTED_NATIVE_QQ_CONSTRUCTION'
    const { nickname, categories, ...probe } = state
    emit(failure ? 'FAIL' : 'PASS', { reason: failure ?? null, expectedUin: config.uin, protocol: config.protocol,
      exit: exit ?? null, sourcesUnchanged, uidAvailable: nonempty(lastLoginInfo?.uid),
      nicknameAvailable: nonempty(lastLoginInfo?.nick), stableMs: stableSince === undefined ? 0 : Date.now() - stableSince,
      native: native.build, probe, categories: [...categories], metadataLog: workspace.metadataLog })
    if (failure) process.exitCode = 1
  }
}

main().catch(error => {
  console.error(JSON.stringify({ event: 'FAIL', reason: error instanceof SmokeError ? error.code : 'PREFLIGHT_FAILED' }))
  process.exitCode = 1
})
