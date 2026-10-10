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

/**
 * PMHQ GET /health 响应, 只列用到的字段 (PMHQ.Rust src/server.rs handle_health)。
 * memory/cpu 是新 PMHQ 才有的, 老版本不返。
 */
export interface PMHQHealth {
  uin?: number | null
  uid?: string | null
  qq_full_version?: string
  // 字节. qq_using = QQ 主进程 RSS, 不含 Electron 子进程
  memory?: { qq_using: number; free: number; total: number }
  // 整机占比小数 (0.1 = 10%), total 恒 1.0; 按相邻两次 /health 的增量算, 首次打恒为 0
  cpu?: { qq_using: number; free: number; total: number }
}

/** QQ 进程资源占用, 已归一成 WebUI 口径 (字节 + 百分数) */
export interface QQResourceUsage {
  memory: number
  totalMemory: number
  memoryPercent: number
  cpu: number
  version?: string
}
