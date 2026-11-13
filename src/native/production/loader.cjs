'use strict'

// This module intentionally does not load native code until loadNative() is called.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { tmpdir } = require('node:os')
const { TARGETS } = require('./targets.cjs')
const NAME = 'lucky-lillia-node'
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

function fail(message) { throw new Error(`[${NAME}] ${message}`) }

function detectTarget(runtime = process) {
  if (Number(runtime.versions.node.split('.')[0]) < 18 || Number(runtime.versions.napi || 0) < 8) {
    fail('Node.js >=18 with Node-API >=8 is required')
  }
  let libc
  if (runtime.platform === 'linux') {
    const report = runtime.report?.getReport()
    if (report?.header?.glibcVersionRuntime) libc = 'glibc'
    else if (report?.sharedObjects?.some(file => /(?:ld-musl-|libc[.]musl-)/.test(file))) libc = 'musl'
    else {
      // musl may omit its own loader from sharedObjects. Check the process executable.
      let executable
      try { executable = fs.readFileSync(runtime.execPath) } catch {}
      if (executable?.includes(Buffer.from('ld-musl-'))) libc = 'musl'
      else fail('Cannot determine Linux libc; Node diagnostic reports must be available')
    }
  }
  const match = Object.entries(TARGETS).find(([, target]) => target.platform === runtime.platform
    && target.arch === runtime.arch && target.libc === libc)
  if (!match) fail(`Unsupported platform ${runtime.platform}/${runtime.arch}${libc ? `/${libc}` : ''}`)
  return match[0]
}

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative.includes(':')) {
    fail(`Invalid artifact path: ${relative}`)
  }
  const base = path.resolve(root)
  const result = path.resolve(base, relative)
  if (!result.startsWith(base + path.sep)) fail(`Artifact escapes bundle: ${relative}`)
  let cursor = base
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part)
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) fail(`Symlink artifact is not allowed: ${relative}`)
  }
  return result
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (error) { fail(`Cannot read ${file}: ${error.message}`) }
}

function verifyFiles(root, files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) fail('Invalid artifact file list')
  for (const [relative, hash] of Object.entries(files)) {
    const file = safePath(root, relative)
    if (!/^[a-f0-9]{64}$/.test(hash)) fail(`Invalid SHA-256 for ${relative}`)
    let bytes
    try {
      if (!fs.statSync(file).isFile()) fail(`Artifact is not a file: ${relative}`)
      bytes = fs.readFileSync(file)
    } catch (error) { fail(`Missing artifact ${relative}: ${error.message}`) }
    if (sha256(bytes) !== hash) fail(`Integrity mismatch for ${relative}; reinstall the complete matching bundle`)
  }
}

function inspectBundle(root, { target = detectTarget(), allTargets = false } = {}) {
  const manifest = readJson(path.join(root, 'manifest.json'))
  if (![1, 2].includes(manifest.schemaVersion) || manifest.package?.name !== NAME
      || typeof manifest.package.version !== 'string'
      || !['production', 'development'].includes(manifest.variant)
      || !manifest.targets || typeof manifest.targets !== 'object') fail('Invalid bundle manifest')
  const packageJson = readJson(path.join(root, 'package.json'))
  if (packageJson.name !== NAME || packageJson.version !== manifest.package.version
      || packageJson.nativeVariant !== manifest.variant || packageJson.type !== 'commonjs') fail('Package metadata does not match bundle manifest')
  const entry = manifest.targets[target]
  if (!entry) fail(`Bundle has no ${target} artifacts (${manifest.variant}); rebuild or install that target`)
  const selected = allTargets ? Object.keys(manifest.targets) : [target]
  const verified = {}
  // Verify executable entrypoints and declarations before consulting target metadata.
  for (const file of ['index.js', 'index.d.ts', 'loader.cjs', 'targets.cjs', 'package.json']) {
    if (!manifest.files?.[file]) fail(`Manifest is missing ${file}`)
  }
  verifyFiles(root, Object.fromEntries(Object.entries(manifest.files).filter(([file]) => !file.includes('/'))))
  for (const name of selected) {
    const spec = TARGETS[name]
    const item = manifest.targets[name]
    const expectedDirectory = manifest.schemaVersion === 1 ? `native/${name}` : name
    if (!spec || item.target !== spec.triple || item.directory !== expectedDirectory
        || !/^[a-f0-9-]{36}$/.test(item.buildId)) fail(`Invalid target metadata for ${name}`)
    const metadataFile = `${item.directory}/build.json`
    if (!manifest.files[metadataFile] || manifest.files[metadataFile] !== item.metadataSha256) fail(`Missing build metadata hash for ${name}`)
    verifyFiles(root, { [metadataFile]: item.metadataSha256 })
    const metadata = readJson(safePath(root, metadataFile))
    // Windows may ship without the injection sidecar: the default hardware-breakpoint
    // debugger hook performs no DLL injection. sidecar === null is accepted only where
    // the target schema marks it optional; every other platform must carry its sidecar.
    const sidecarValid = metadata.sidecar === null ? spec.sidecarOptional === true : metadata.sidecar === spec.sidecar
    const expectedFiles = metadata.sidecar ? ['LuckyLillia.NTQQ.node', spec.sidecar] : ['LuckyLillia.NTQQ.node']
    if (metadata.sidecarProtection && (!metadata.sidecar || spec.platform !== 'linux')) fail('Invalid sidecar protection for ' + name)
    for (const [field, protection] of [['runtime', metadata.protection], ['sidecarRuntime', metadata.sidecarProtection]]) {
      const runtime = metadata[field]
      if (runtime != null) {
        if (spec.libc !== 'musl' || !/^liblucky_vmp_[a-f0-9]{32}[.]so$/.test(runtime)
            || protection?.compatibility?.musl?.file !== runtime
            || metadata.files?.[runtime] !== protection.compatibility.musl.sha256
            || expectedFiles.includes(runtime)) {
          fail('Invalid or unpaired VMProtect loader for ' + name)
        }
        expectedFiles.push(runtime)
      } else if (protection?.compatibility?.musl) fail('Missing VMProtect loader for ' + name)
    }
    if (metadata.schemaVersion !== 1 || metadata.package?.name !== NAME || metadata.package.version !== manifest.package.version
        || metadata.variant !== manifest.variant || metadata.target !== spec.triple || metadata.buildId !== item.buildId
        || !sidecarValid || metadata.addon !== 'LuckyLillia.NTQQ.node'
        || Object.keys(metadata.files || {}).sort().join(',') !== expectedFiles.sort().join(',')) fail(`Mixed or invalid build metadata for ${name}`)
    for (const [file, hash] of Object.entries(metadata.files)) {
      if (manifest.files[`${item.directory}/${file}`] !== hash) fail(`Mismatched artifact hash for ${name}/${file}`)
    }
    verifyFiles(safePath(root, item.directory), metadata.files)
    // A sidecar-optional target that declares none must not carry an unanchored file in
    // its sidecar slot: otherwise an attacker with write access could drop a malicious
    // pmhq.dll that inline/hwbp mode would inject, since it is outside metadata.files.
    if (metadata.sidecar === null && fs.existsSync(safePath(root, `${item.directory}/${spec.sidecar}`))) {
      fail(`Unanchored ${spec.sidecar} present for ${name}; rebuild with --with-sidecar or remove it`)
    }
    verified[name] = metadata
  }
  return { manifest, target, directory: safePath(root, entry.directory), metadata: verified[target] }
}

function copyTarget(bundle, cacheDir) {
  if (!path.isAbsolute(cacheDir)) fail('cacheDir must be an absolute path')
  const { manifest, target, metadata, directory } = bundle
  const cacheRoot = path.resolve(cacheDir)
  fs.mkdirSync(cacheRoot, { recursive: true })
  if (fs.lstatSync(cacheRoot).isSymbolicLink()) fail('cacheDir cannot be a symbolic link')
  const metadataHash = manifest.targets[target].metadataSha256
  // The metadata digest binds buildId and sidecar hashes without lengthening the
  // Windows path with both the UUID and the digest. The addon keeps its full hash.
  const destination = safePath(cacheRoot, `${target}-${manifest.variant}-${metadataHash}`)
  const addonName = cachedAddonName(metadata)
  const files = Object.fromEntries(Object.entries(metadata.files).map(([file, hash]) => [file === metadata.addon ? addonName : file, hash]))
  files['build.json'] = metadataHash
  const verifyCache = directory => {
    verifyFiles(directory, files)
    if (metadata.sidecar === null && fs.existsSync(safePath(directory, TARGETS[target].sidecar))) {
      fail(`Unanchored ${TARGETS[target].sidecar} present in cache for ${target}`)
    }
  }
  if (fs.existsSync(destination)) {
    verifyCache(destination)
    return destination
  }
  const staging = fs.mkdtempSync(path.join(cacheRoot, '.native-'))
  try {
    for (const file of Object.keys(files)) {
      fs.copyFileSync(safePath(directory, file === addonName ? metadata.addon : file), safePath(staging, file), fs.constants.COPYFILE_EXCL)
    }
    verifyCache(staging)
    try { fs.renameSync(staging, destination) }
    catch (error) {
      // Concurrent Workers may have completed this exact immutable build first.
      if (!fs.existsSync(destination)) throw error
      verifyCache(destination)
    }
  } finally {
    // Only these verified files can belong to this fresh staging directory. Avoid
    // Node 24's Windows recursive rm path conversion issue on non-ASCII paths.
    for (const file of Object.keys(files)) {
      try { fs.unlinkSync(safePath(staging, file)) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    try { fs.rmdirSync(staging) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return destination
}

function cachedAddonName(metadata) {
  return `LuckyLillia.NTQQ.${metadata.files[metadata.addon]}.node`
}

function loadNative(root, { cacheDir = path.join(tmpdir(), NAME) } = {}) {
  const bundle = inspectBundle(path.resolve(root))
  const requestedDirectory = copyTarget(bundle, cacheDir)
  // musl initializes a DT_NEEDED library once per process. All copies of the
  // same protected build must therefore use one ELF mapping, including across
  // Workers and caller-selected cache directories. Still verify the requested
  // cache before using the shared mapping, so damaged copies are never accepted.
  const directory = bundle.metadata.runtime
    ? copyTarget(bundle, path.join(tmpdir(), NAME, 'vmp-musl')) : requestedDirectory
  let native
  try { native = require(path.join(directory, cachedAddonName(bundle.metadata))) }
  catch (error) { fail(`Failed to load ${bundle.target} (${bundle.manifest.variant}): ${error.message}`) }
  if (typeof native.ping !== 'function' || native.ping() !== `lucky-lillia-node v${bundle.manifest.package.version} ok`) {
    fail('Compiled addon version does not match the bundle package version; rebuild both native artifacts')
  }
  const info = Object.freeze({ package: NAME, version: bundle.manifest.package.version,
    variant: bundle.manifest.variant, target: bundle.target, buildId: bundle.metadata.buildId })
  return Object.assign({}, native, { getNativeDirectory: () => directory, getNativeBuildInfo: () => info })
}

module.exports = { loadNative, inspectBundle, copyTarget, detectTarget, safePath, verifyFiles, sha256 }
