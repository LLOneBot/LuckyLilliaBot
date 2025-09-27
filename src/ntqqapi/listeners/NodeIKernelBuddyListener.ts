export interface NodeIKernelBuddyListener {
  onDoubtBuddyReqChange(arg: {
    reqId: string
    cookie: string
    doubtList: {
      uid: string
      nick: string
      age: number
      sex: number
      commFriendNum: number
      reqTime: string
      msg: string
      source: string
      reason: string
      groupCode: string
      nameMore: unknown
    }[]
  }): void
}
