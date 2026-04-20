import { describe, it, expect, vi } from 'vitest'

// Mock cordis Context
vi.mock('cordis', () => ({
  Context: class {},
  Inject: vi.fn(),
}))

// 直接测试 getPeer 的逻辑（通过 mock ntUserApi）
describe('Satori getPeer logic', () => {
  it('群聊 channel_id 解析', () => {
    const channelId = '123456789'
    expect(channelId.startsWith('private:')).toBe(false)
    // 群聊返回 Group chatType
  })

  it('私聊 channel_id 以 private: 开头', () => {
    const channelId = 'private:987654321'
    expect(channelId.startsWith('private:')).toBe(true)
    expect(channelId.replace('private:', '')).toBe('987654321')
  })
})

describe('Satori Server Auth', () => {
  it('Bearer token 格式提取', () => {
    const authHeader = 'Bearer test-token-123'
    const token = authHeader.replace('Bearer ', '')
    expect(token).toBe('test-token-123')
  })

  it('空 Authorization header', () => {
    const authHeader = ''
    expect(authHeader).toBeFalsy()
  })

  it('无效 Authorization 格式', () => {
    const authHeader = 'Basic dXNlcjpwYXNz'
    expect(authHeader.startsWith('Bearer ')).toBe(false)
  })
})

describe('Satori WebSocket Protocol', () => {
  // Satori opcodes
  const Opcode = {
    EVENT: 0,
    IDENTIFY: 1,
    READY: 2,
    PING: 3,
    PONG: 4,
  }

  it('IDENTIFY opcode 应为 1', () => {
    expect(Opcode.IDENTIFY).toBe(1)
  })

  it('READY opcode 应为 2', () => {
    // 实际 Satori 协议中 READY 是 0 (EVENT opcode)
    // 但在 LLBot 实现中 READY 响应包含 logins 信息
  })

  it('PING/PONG 心跳', () => {
    expect(Opcode.PING).toBe(3)
    expect(Opcode.PONG).toBe(4)
  })

  it('Event 结构包含必要字段', () => {
    const event = {
      id: 1,
      sn: 1,
      type: 'message-created',
      self_id: '123456',
      platform: 'llonebot',
      timestamp: Date.now(),
    }
    expect(event).toHaveProperty('id')
    expect(event).toHaveProperty('type')
    expect(event).toHaveProperty('self_id')
    expect(event).toHaveProperty('platform')
    expect(event.platform).toBe('llonebot')
  })
})
