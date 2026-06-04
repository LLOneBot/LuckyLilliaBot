import { GetImplInfoOutput } from '../generated/schema'

export function transformProtocolOsType(type: string): GetImplInfoOutput['qq_protocol_type'] {
  if (type === 'Linux') {
    return 'linux'
  } else if (type === 'Darwin') {
    return 'macos'
  } else {
    return 'windows'
  }
}
