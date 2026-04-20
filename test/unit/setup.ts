import { vi } from 'vitest'

// Mock globalVars
vi.mock('@/common/globalVars', () => ({
  DATA_DIR: '/tmp/test-data',
  TEMP_DIR: '/tmp/test-data/temp',
  LOG_DIR: '/tmp/test-data/logs',
  dbDir: '/tmp/test-data/database',
  selfInfo: { uid: 'test-uid', uin: '123456', nick: 'TestBot', online: true },
  getFixedDataDir: vi.fn(() => '/tmp/test-fixed'),
}))

vi.mock('@/common/utils/environment', () => ({
  isDockerEnvironment: vi.fn(() => false),
}))
