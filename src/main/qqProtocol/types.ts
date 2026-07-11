export interface PBData {
  echo?: string
  cmd: string
  pb: string
}

export interface PMHQResSendPB {
  // 发包响应实际 type 是 'recv'(PMHQ WsEvent.kind), 历史上类型写成 'send'; 两者都收
  type: 'send' | 'recv'
  data: PBData
  // PMHQ active-send 结果码: 0=QQ 真回包(已登录); 非0=失败(-100 未登录/管道未连, 或 QQ app error)
  code?: number
  message?: string
}

export interface PMHQResRecvPB {
  type: 'recv'
  data: PBData
  code?: number
  message?: string
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
