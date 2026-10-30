'use strict'

// --require observer for sign-smoke.mjs. Changes the loader export in this
// process's require cache only. Native arguments, callbacks, results, promises,
// and thrown errors pass through unchanged. No token/body bytes are recorded.
const path = require('node:path')
const loaderPath = process.env.LLBOT_SIGN_SMOKE_LOADER
const nonce = process.env.LLBOT_SIGN_SMOKE_NONCE
if (!loaderPath || !path.isAbsolute(loaderPath) || !/^[a-f0-9]{32}$/.test(nonce || '')) {
  throw new Error('sign smoke probe configuration is missing')
}
const prefix = `@@LLBOT_SIGN_SMOKE:${nonce}@@`
function emit(event, data = {}) {
  try { process.stdout.write(prefix + JSON.stringify({ event, ...data }) + '\n') } catch {}
}
function classify(error) {
  const message = String(error?.message || '')
  if (/401|403|unauthori[sz]ed|forbidden|auth.?token|无权限|鉴权/i.test(message)) return 'AUTH_REJECTED'
  if (/certificate|TLS|SSL|pinning|证书/i.test(message)) return 'TLS_ERROR'
  if (/timeout|timed out|ECONN|ENOTFOUND|network|connect|连接|网络/i.test(message)) return 'NETWORK_ERROR'
  return 'NATIVE_SIGN_ERROR'
}
function commandMetadata(args) {
  const input = args[0]
  return { cmd: typeof input?.cmd === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(input.cmd) ? input.cmd : '[unknown]',
    seq: Number.isSafeInteger(input?.seq) ? input.seq : null }
}
function observe(fn, receiver, name) {
  return function (...args) {
    const metadata = name === 'signRequest' ? commandMetadata(args) : {}
    emit(`${name}_call`, metadata)
    const success = value => {
      if (name === 'signRequest') {
        const buffers = ['sign', 'token', 'extra'].every(key => Buffer.isBuffer(value?.[key]))
        const lengths = Object.fromEntries(['sign', 'token', 'extra'].map(key => [`${key}Length`, Buffer.isBuffer(value?.[key]) ? value[key].length : 0]))
        emit('signRequest_success', { ...metadata, buffers, ...lengths })
      } else emit(`${name}_success`)
    }
    const failure = error => emit(`${name}_failure`, { ...metadata, category: classify(error) })
    let result
    try { result = Reflect.apply(fn, receiver, args) } catch (error) { failure(error); throw error }
    if (result && typeof result.then === 'function') {
      // Observe the existing promise; return the exact original object to Bot.
      result.then(success, failure).catch(() => {})
    } else success(result)
    return result
  }
}

try {
  const loader = require(loaderPath)
  const original = loader.loadNative
  const wrapped = new WeakMap()
  loader.loadNative = function (...args) {
    const addon = Reflect.apply(original, this, args)
    if (wrapped.has(addon)) return wrapped.get(addon)
    const copy = { ...addon }
    for (const name of ['init', 'signRequest']) {
      if (typeof addon[name] !== 'function') throw new Error('required native sign export is missing')
      copy[name] = observe(addon[name], addon, name)
    }
    if (typeof addon.NativeQQ === 'function') {
      copy.NativeQQ = new Proxy(addon.NativeQQ, {
        construct(target, args, newTarget) {
          emit('NativeQQ_construct')
          return Reflect.construct(target, args, newTarget)
        },
      })
    }
    wrapped.set(addon, copy)
    const build = addon.getNativeBuildInfo()
    emit('native_loaded', { buildId: build.buildId, variant: build.variant, target: build.target, nativeQQAvailable: typeof addon.NativeQQ === 'function' })
    return copy
  }
  emit('probe_ready', { nativeQQConstructions: 0 })
} catch (error) {
  emit('probe_failure', { category: classify(error) })
  throw new Error('sign smoke preload failed')
}
