import { GetImplInfoOutput } from '../generated/schema'

export function transformProtocolOsType(type: string): GetImplInfoOutput['qq_protocol_type'] {
  // type = profile.devType (Linux / Windows / Mac / Watch)
  if (type === 'Linux') {
    return 'linux'
  } else if (type === 'Mac' || type === 'Darwin') {
    return 'macos'
  } else if (type === 'Watch') {
    return 'watch'
  } else {
    return 'windows'
  }
}
