import path from 'node:path'
import { PathStyle, RemotePathMapping } from '@/common/types'

type PathModule = typeof path.posix

const pathModules: Record<PathStyle, PathModule> = {
  posix: path.posix,
  win32: path.win32,
}

export interface NormalizedRemotePathMapping extends RemotePathMapping {
  remotePrefix: string
  localPrefix: string
}

interface Direction {
  sourcePrefix: string
  sourceStyle: PathStyle
  targetPrefix: string
  targetStyle: PathStyle
}

export interface RemotePathMapper {
  remotePathToLocal(filePath: string): string
  localPathToRemote(filePath: string): string
}

export function normalizeRemotePathMappings(mappings: readonly RemotePathMapping[] = []): NormalizedRemotePathMapping[] {
  return mappings.map(mapping => {
    const remoteStyle = mapping.remoteStyle
    const localStyle = mapping.localStyle

    return {
      ...mapping,
      remoteStyle,
      localStyle,
      remotePrefix: normalizePrefix(mapping.remotePrefix, remoteStyle, 'remotePrefix'),
      localPrefix: normalizePrefix(mapping.localPrefix, localStyle, 'localPrefix'),
    }
  })
}

export function createRemotePathMapper(mappings: readonly RemotePathMapping[] = []): RemotePathMapper {
  const normalizedMappings = normalizeRemotePathMappings(mappings)
  const remoteToLocalDirections = normalizedMappings.map(mapping => ({
    sourcePrefix: mapping.remotePrefix,
    sourceStyle: mapping.remoteStyle,
    targetPrefix: mapping.localPrefix,
    targetStyle: mapping.localStyle,
  }))
  const localToRemoteDirections = normalizedMappings.map(mapping => ({
    sourcePrefix: mapping.localPrefix,
    sourceStyle: mapping.localStyle,
    targetPrefix: mapping.remotePrefix,
    targetStyle: mapping.remoteStyle,
  }))

  return {
    remotePathToLocal(filePath: string) {
      return mapPath(filePath, remoteToLocalDirections)
    },
    localPathToRemote(filePath: string) {
      return mapPath(filePath, localToRemoteDirections)
    },
  }
}

export function mapRemotePathToLocal(filePath: string, mappings: readonly RemotePathMapping[] = []): string {
  return createRemotePathMapper(mappings).remotePathToLocal(filePath)
}

export function mapLocalPathToRemote(filePath: string, mappings: readonly RemotePathMapping[] = []): string {
  return createRemotePathMapper(mappings).localPathToRemote(filePath)
}

function normalizePrefix(prefix: string, style: PathStyle, fieldName: string) {
  if (!prefix) {
    throw new Error(`remote path mapping ${fieldName} must not be empty`)
  }

  const pathModule = pathModules[style]
  const normalized = stripTrailingSeparators(pathModule.normalize(prefix), style)
  if (!pathModule.isAbsolute(normalized)) {
    throw new Error(`remote path mapping ${fieldName} must be an absolute ${style} path: ${prefix}`)
  }
  return normalized
}

function mapPath(filePath: string, directions: Direction[]) {
  let matched: Direction | undefined
  let normalizedSourcePath = ''

  for (const direction of directions) {
    const pathModule = pathModules[direction.sourceStyle]
    const candidate = pathModule.normalize(filePath)
    if (!pathModule.isAbsolute(candidate)) {
      continue
    }
    if (!isPrefixMatch(candidate, direction.sourcePrefix, direction.sourceStyle)) {
      continue
    }
    if (!matched || direction.sourcePrefix.length > matched.sourcePrefix.length) {
      matched = direction
      normalizedSourcePath = candidate
    }
  }

  if (!matched) {
    return filePath
  }

  const rest = normalizedSourcePath.slice(matched.sourcePrefix.length)
  const restParts = splitPathRest(rest, matched.sourceStyle)
  return pathModules[matched.targetStyle].normalize(pathModules[matched.targetStyle].join(matched.targetPrefix, ...restParts))
}

function isPrefixMatch(filePath: string, prefix: string, style: PathStyle) {
  const normalizedFilePath = style === 'win32' ? filePath.toLowerCase() : filePath
  const normalizedPrefix = style === 'win32' ? prefix.toLowerCase() : prefix
  if (normalizedFilePath === normalizedPrefix) {
    return true
  }

  const root = pathModules[style].parse(prefix).root
  if (prefix === root) {
    return normalizedFilePath.startsWith(normalizedPrefix)
  }

  return normalizedFilePath.startsWith(normalizedPrefix + pathModules[style].sep)
}

function splitPathRest(rest: string, style: PathStyle) {
  if (!rest) {
    return []
  }
  if (style === 'win32') {
    return rest.split(/[\\/]+/).filter(Boolean)
  }
  return rest.split('/').filter(Boolean)
}

function stripTrailingSeparators(input: string, style: PathStyle) {
  const root = pathModules[style].parse(input).root
  let output = input
  while (output.length > root.length && output.endsWith(pathModules[style].sep)) {
    output = output.slice(0, -1)
  }
  return output
}
