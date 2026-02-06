import { GroupAllInfo, GroupDetailInfo } from '../types'

export interface NodeIKernelGroupListener {
  onGroupDetailInfoChange(groupDetail: GroupDetailInfo): void

  onGroupAllInfoChange(groupAll: GroupAllInfo): void
}
