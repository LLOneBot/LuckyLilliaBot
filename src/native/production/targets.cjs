'use strict'

const TARGETS = Object.freeze({
  // Windows defaults to the debugger (hardware-breakpoint) hook, which performs no
  // DLL injection, so the sidecar is optional. inline/hwbp modes still need it and
  // the runtime reports a clear error if a mode that requires injection finds none.
  'win-x64': { triple: 'x86_64-pc-windows-msvc', platform: 'win32', arch: 'x64', sidecar: 'pmhq.dll', sidecarOptional: true },
  'linux-x64-glibc': { triple: 'x86_64-unknown-linux-gnu', platform: 'linux', arch: 'x64', libc: 'glibc', sidecar: 'libpmhq.so' },
  'linux-arm64-glibc': { triple: 'aarch64-unknown-linux-gnu', platform: 'linux', arch: 'arm64', libc: 'glibc', sidecar: 'libpmhq.so' },
  'linux-x64-musl': { triple: 'x86_64-unknown-linux-musl', platform: 'linux', arch: 'x64', libc: 'musl', sidecar: 'libpmhq.so' },
  'linux-arm64-musl': { triple: 'aarch64-unknown-linux-musl', platform: 'linux', arch: 'arm64', libc: 'musl', sidecar: 'libpmhq.so' },
  'darwin-x64': { triple: 'x86_64-apple-darwin', platform: 'darwin', arch: 'x64', sidecar: 'libpmhq.dylib' },
  'darwin-arm64': { triple: 'aarch64-apple-darwin', platform: 'darwin', arch: 'arm64', sidecar: 'libpmhq.dylib' },
})

function resolveTarget(value) {
  const entry = Object.entries(TARGETS).find(([name, target]) => name === value || target.triple === value)
  if (!entry) throw new Error(`Unsupported target ${value}; expected ${Object.keys(TARGETS).join(', ')}`)
  return { name: entry[0], ...entry[1] }
}

module.exports = { TARGETS, resolveTarget }
