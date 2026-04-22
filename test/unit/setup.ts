import { vi } from 'vitest'

vi.mock('@/common/globalVars', () => ({
  DATA_DIR: '/tmp/test-data',
  TEMP_DIR: '/tmp/test-data/temp',
  LOG_DIR: '/tmp/test-data/logs',
  dbDir: '/tmp/test-data/database',
  selfInfo: { uid: 'test-uid', uin: '123456', nick: 'TestBot', online: true },
  getFixedDataDir: vi.fn(() => '/tmp/test-fixed'),
}))

vi.mock('@/main/config', () => ({
  webuiTokenUtil: {
    getToken: vi.fn(() => 'test-token'),
    setToken: vi.fn(),
  },
  getConfigUtil: vi.fn(() => ({
    getConfig: vi.fn(() => ({
      ob11: { enable: false, connect: [] },
      satori: { enable: false },
      milky: { enable: false },
      webui: { enable: true, host: '0.0.0.0', port: 3080 },
    })),
    setConfig: vi.fn(),
  })),
}))

vi.mock('@/ntqqapi/native/pmhq', () => ({
  pmhq: {
    getProcessInfo: vi.fn(() => Promise.resolve({
      memory: { rss: 100000000, totalMem: 8000000000 },
      cpu: { percent: 5.0 },
    })),
    tellPort: vi.fn(() => Promise.resolve()),
    getMultiMsg: vi.fn(() => Promise.resolve([])),
  },
}))

vi.mock('@/main/log', () => ({
  getLogCache: vi.fn(() => []),
}))

vi.mock('@/common/utils/environment', () => ({
  isDockerEnvironment: vi.fn(() => false),
}))
