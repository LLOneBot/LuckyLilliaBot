export interface PBData {
  echo?: string
  cmd: string
  pb: string
}

export interface PMHQResSendPB {
  type: 'send'
  data: PBData
}

export interface PMHQResRecvPB {
  type: 'recv'
  data: PBData
}

export interface PMHQReqSendPB {
  type: 'send'
  data: PBData
}

export type PMHQRes = PMHQResSendPB | PMHQResRecvPB
export type PMHQReq = PMHQReqSendPB

export interface ResListener<R extends PMHQRes> {
  (data: R): void
}
