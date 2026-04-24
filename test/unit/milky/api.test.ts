import { describe, it, expect } from 'vitest'

describe('Milky API Response Format', () => {
  function okResponse(data: unknown) {
    return { status: 'ok', retcode: 0, data }
  }

  function failedResponse(retcode: number, message: string) {
    return { status: 'failed', retcode, message }
  }

  it('成功响应格式', () => {
    const resp = okResponse({ user_id: 123456, nickname: 'TestBot' })
    expect(resp.status).toBe('ok')
    expect(resp.retcode).toBe(0)
    expect(resp.data).toHaveProperty('user_id')
  })

  it('参数验证失败 (-400)', () => {
    const resp = failedResponse(-400, 'Invalid payload')
    expect(resp.status).toBe('failed')
    expect(resp.retcode).toBe(-400)
  })

  it('资源未找到 (-404)', () => {
    const resp = failedResponse(-404, 'User not found')
    expect(resp.retcode).toBe(-404)
  })

  it('服务器错误 (-500)', () => {
    const resp = failedResponse(-500, 'Internal error')
    expect(resp.retcode).toBe(-500)
  })
})

describe('Milky Auth Token Extraction', () => {
  function extractToken(headers: Record<string, string>, query: Record<string, string>) {
    const authHeader = headers['authorization'] || ''
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7)
    }
    return query['access_token'] || null
  }

  it('从 Authorization header 提取 token', () => {
    const token = extractToken({ authorization: 'Bearer my-token' }, {})
    expect(token).toBe('my-token')
  })

  it('从 query 参数提取 token', () => {
    const token = extractToken({}, { access_token: 'query-token' })
    expect(token).toBe('query-token')
  })

  it('header 优先于 query', () => {
    const token = extractToken(
      { authorization: 'Bearer header-token' },
      { access_token: 'query-token' }
    )
    expect(token).toBe('header-token')
  })

  it('无 token 返回 null', () => {
    const token = extractToken({}, {})
    expect(token).toBeNull()
  })

  it('无效 Authorization 格式', () => {
    const token = extractToken({ authorization: 'Basic xxx' }, {})
    expect(token).toBeNull()
  })
})

describe('Milky Event Structure', () => {
  function makeEvent(type: string, data: Record<string, unknown> = {}) {
    return {
      time: Math.floor(Date.now() / 1000),
      self_id: 123456,
      event_type: type,
      data,
    }
  }

  it('message_receive 事件', () => {
    const event = makeEvent('message_receive', {
      message_scene: 'group',
      peer_id: 164461995,
      message_seq: 1001,
      sender_id: 2984196,
      segments: [{ type: 'text', data: { text: '你好' } }],
    })
    expect(event.event_type).toBe('message_receive')
    expect(event.data.message_scene).toBe('group')
    expect(event.data.segments).toHaveLength(1)
  })

  it('message_recall 事件', () => {
    const event = makeEvent('message_recall', {
      message_scene: 'group',
      peer_id: 164461995,
      message_seq: 1001,
      operator_id: 2984196,
    })
    expect(event.event_type).toBe('message_recall')
    expect(event.data).toHaveProperty('operator_id')
  })

  it('group_member_increase 事件', () => {
    const event = makeEvent('group_member_increase', {
      group_id: 164461995,
      user_id: 12345,
      operator_id: 67890,
      type: 'invite',
    })
    expect(event.event_type).toBe('group_member_increase')
    expect(event.data.type).toBe('invite')
  })

  it('friend_request 事件', () => {
    const event = makeEvent('friend_request', {
      user_id: 12345,
      message: '请加我为好友',
    })
    expect(event.event_type).toBe('friend_request')
  })

  it('bot_offline 事件', () => {
    const event = makeEvent('bot_offline', {})
    expect(event.event_type).toBe('bot_offline')
    expect(event.self_id).toBe(123456)
  })

  it('事件时间戳为秒级', () => {
    const event = makeEvent('message_receive')
    expect(event.time).toBeLessThan(10000000000) // 秒级，不是毫秒
  })
})
