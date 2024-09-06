import { User, UserDetailInfoListenerArg } from '@/ntqqapi/types'

export interface IProfileListener {
  onProfileSimpleChanged(...args: unknown[]): void

  onUserDetailInfoChanged(arg: UserDetailInfoListenerArg): void

  onProfileDetailInfoChanged(profile: User): void

  onStatusUpdate(...args: unknown[]): void

  onSelfStatusChanged(...args: unknown[]): void

  onStrangerRemarkChanged(...args: unknown[]): void
}