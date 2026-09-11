import { vi } from 'vitest'

export function createMockContext() {
  const services: Record<string, any> = {
    ntLoginApi: {
      getLoginQrCode: vi.fn(),
      getQuickLoginList: vi.fn(),
      quickLoginWithUin: vi.fn(),
    },
    ntFriendApi: {
      getFriends: vi.fn(() => Promise.resolve({
        friends: [],
        categories: new Map()
      })),
      getFriendRequests: vi.fn(() => Promise.resolve([])),
      getDoubtFriendRequests: vi.fn(() => Promise.resolve([])),
      approvalDoubtFriendRequest: vi.fn(() => Promise.resolve({ errorCode: 0 })),
      approvalFriendRequest: vi.fn(() => Promise.resolve({ errorCode: 0 })),
    },
    ntGroupApi: {
      getGroups: vi.fn(() => Promise.resolve([])),
      getGroupMembers: vi.fn(() => Promise.resolve([])),
      getGroupNotifications: vi.fn(() => Promise.resolve({ nextStartSeq: 0, notifications: [] })),
      setGroupRequest: vi.fn(() => Promise.resolve({ errorCode: 0 })),
    },
    ntSystemApi: {
      getDeviceInfo: vi.fn(() => Promise.resolve({ os: 'Linux', kernel: '5.4' })),
    },
    ntMsgApi: {
      getMsgsBySeqAndCount: vi.fn(() => Promise.resolve({ msgList: [] })),
      getLatestMsgSeq: vi.fn(() => Promise.resolve(100)),
      sendMsg: vi.fn(() => Promise.resolve({ msgId: 'mock-msg-id' })),
    },
    ntUserApi: {
      getUinByUid: vi.fn(() => Promise.resolve('654321')),
      getUidByUin: vi.fn(() => Promise.resolve('mock-uid')),
      getUserByUid: vi.fn(() => Promise.resolve({
        uid: 'mock-uid',
        nick: 'MockUser',
        remark: '',
      })),
    },
    ntFileApi: {
      rkeyManager: { getRkey: vi.fn(() => Promise.resolve({ private_rkey: '', group_rkey: '' })) },
      getPttUrl: vi.fn(),
    },
    qqProtocol: {
      getProcessInfo: vi.fn(() => Promise.resolve({
        memory: { rss: 100000000, totalMem: 8000000000 },
        cpu: { percent: 5.0 },
      })),
      getMultiMsg: vi.fn(() => Promise.resolve([])),
    },
    // 发消息统一走 app.sendMessage (它才会为 C2C 补发 nt/message-sent), 不是 ntMsgApi.sendMsg
    app: {
      sendMessage: vi.fn(() => Promise.resolve({ msgId: 'mock-msg-id' })),
    },
    config: {
      get: vi.fn(() => ({
        ob11: { enable: false, connect: [] },
        satori: { enable: false },
        milky: { enable: false },
        webui: { enable: true, host: '0.0.0.0', port: 3080 },
      })),
      set: vi.fn(),
    },
  }

  const ctx = {
    ...services,
    emailNotification: null as any,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    // 模拟 cordis 的 ctx.get: 优先查 services, 回退到 ctx 自身属性 (如 emailNotification)
    get: vi.fn((key: string) => {
      const v = services[key]
      return v !== undefined ? v : (ctx as any)[key]
    }),
    on: vi.fn(() => vi.fn()),
    parallel: vi.fn(),
  } as any

  return ctx
}
