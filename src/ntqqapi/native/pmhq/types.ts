export interface PBData {
  echo?: string
  cmd: string
  pb: string
}

export interface CallResultData {
  echo?: string
  result: any
}

export interface OnListenerData {
  echo: string | null
  sub_type: string
  data: any
}

export interface PMHQResSendPB {
  type: 'send'
  data: PBData
}

export interface PMHQResRecvPB {
  type: 'recv'
  data: PBData
}

export interface PMHQResOn {
  type: 'on_message' | 'on_buddy' | 'on_group'
  data: OnListenerData
}

export interface PMHQResCall {
  type: 'call'
  data: CallResultData
}

export interface PMHQReqSendPB {
  type: 'send'
  data: PBData
}

export interface PMHQReqCall {
  type: 'call'
  data: {
    echo?: string
    func: string
    args: any[]
  }
}

export interface PMHQReqTellPort {
  type: 'broadcast_event'
  data: PMHQResTellPort
}

export interface PMHQResTellPort {
  type: 'llbot_web_ui_port'
  echo?: string
  data: {
    echo?: string
    port: number
  }
}

// QQ 进程信息类型
export interface QQProcessInfo {
  pid: number
  memory: {
    rss: number              // 常驻内存大小 (bytes)
    heapTotal: number        // V8 堆总大小 (bytes)
    heapUsed: number         // V8 堆已用大小 (bytes)
    external: number         // C++ 对象绑定到 JS 的内存 (bytes)
    arrayBuffers: number     // ArrayBuffer 和 SharedArrayBuffer 的内存 (bytes)
    totalMem: number         // 系统总内存 (bytes)
    freeMem: number          // 系统可用内存 (bytes)
  }
  cpu: {
    user: number             // 用户态 CPU 时间 (微秒)
    system: number           // 系统态 CPU 时间 (微秒)
    percent: number          // CPU 使用百分比
    cores: number            // CPU 核心数
  }
  uptime: number             // 进程运行时间 (秒)
  platform: string
  arch: string
  nodeVersion: string
}

export type PMHQRes = PMHQResSendPB | PMHQResRecvPB | PMHQResOn | PMHQResCall | PMHQResTellPort
export type PMHQReq = PMHQReqSendPB | PMHQReqCall | PMHQReqTellPort

export interface ResListener<R extends PMHQRes> {
  (data: R): void
}
