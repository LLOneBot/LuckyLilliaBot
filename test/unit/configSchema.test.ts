import { describe, expect, it } from 'vitest'
import { SetConfigAction } from '@/onebot11/action/llbot/system/Config'

function getSetConfigPayloadSchema() {
  return new SetConfigAction({ ctx: {} } as any).payloadSchema!
}

describe('set_config schema', () => {
  it('accepts remote path mappings without a display name', () => {
    const schema = getSetConfigPayloadSchema()

    expect(() => new schema({
      remotePathMappings: [{
        remotePrefix: '/root/.config/QQ',
        localPrefix: '/host/qq',
        remoteStyle: 'posix',
        localStyle: 'posix',
      }],
    } as any)).not.toThrow()
  })

  it('requires the structural remote path mapping fields', () => {
    const schema = getSetConfigPayloadSchema()

    expect(() => new schema({
      remotePathMappings: [{
        localPrefix: '/host/qq',
        remoteStyle: 'posix',
        localStyle: 'posix',
      }],
    } as any)).toThrow(/remotePrefix.*missing required value/)
    expect(() => new schema({
      remotePathMappings: [{
        remotePrefix: '/root/.config/QQ',
        localPrefix: '/host/qq',
        localStyle: 'posix',
      }],
    } as any)).toThrow(/remoteStyle.*missing required value/)
  })
})
