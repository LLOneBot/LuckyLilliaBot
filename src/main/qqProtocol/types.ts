export interface PBData {
  echo?: string
  cmd: string
  pb: string
}

export interface PMHQResSendPB {
  // 发包响应实际 type 是 'recv'(PMHQ WsEvent.kind), 历史上类型写成 'send'; 两者都收
  type: 'send' | 'recv'
  data: PBData
  // 0 = QQ 回了包; 非 0 = 失败 (-100 未登录 / 管道未连, 或 QQ 报错)
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

/** 只列用到的字段; 老版本 PMHQ 没有 memory / cpu */
export interface PMHQHealth {
  uin?: number | null
  uid?: string | null
  qq_full_version?: string
  // 字节. qq_using = QQ 主进程 RSS, 不含 Electron 子进程
  memory?: { qq_using: number; free: number; total: number }
  // 整机占比小数 (0.1 = 10%), total 恒 1.0; 按相邻两次 /health 的增量算, 首次打恒为 0
  cpu?: { qq_using: number; free: number; total: number }
}

/** 字节 + 百分数 */
export interface QQResourceUsage {
  memory: number
  totalMemory: number
  memoryPercent: number
  cpu: number
  version?: string
}
