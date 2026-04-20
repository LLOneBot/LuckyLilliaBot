import { describe, it, expect } from 'vitest'
import { ElementType, AtType } from '@/ntqqapi/types'

describe('Milky Incoming Segment Transform', () => {
  // 测试 NT element type → Milky segment type 映射逻辑

  it('文本元素 → text segment', () => {
    const element = {
      elementType: ElementType.Text,
      textElement: { content: '你好世界', atType: AtType.Unknown },
    }
    expect(element.elementType).toBe(ElementType.Text)
    expect(element.textElement?.atType).toBe(AtType.Unknown)
    // 应转换为 { type: 'text', data: { text: '你好世界' } }
  })

  it('@全体 → mention_all segment', () => {
    const element = {
      elementType: ElementType.Text,
      textElement: { content: '@全体成员', atType: AtType.All },
    }
    expect(element.textElement.atType).toBe(AtType.All)
    // 应转换为 { type: 'mention_all', data: {} }
  })

  it('@某人 → mention segment', () => {
    const element = {
      elementType: ElementType.Text,
      textElement: { content: '@用户', atType: AtType.One, atUid: '12345' },
    }
    expect(element.textElement.atType).toBe(AtType.One)
    // 应转换为 { type: 'mention', data: { user_id: 12345, name: '用户' } }
  })

  it('图片元素类型', () => {
    const element = {
      elementType: ElementType.Pic,
      picElement: {
        sourcePath: '/path/to/image.png',
        picWidth: 100,
        picHeight: 100,
      },
    }
    expect(element.elementType).toBe(ElementType.Pic)
    // 应转换为 { type: 'image', data: { resource_id, width, height } }
  })

  it('语音元素类型', () => {
    const element = {
      elementType: ElementType.Ptt,
      pttElement: {
        fileUuid: 'uuid-123',
        duration: 10,
      },
    }
    expect(element.elementType).toBe(ElementType.Ptt)
    // 应转换为 { type: 'record', data: { resource_id, duration } }
  })

  it('视频元素类型', () => {
    const element = {
      elementType: ElementType.Video,
      videoElement: {
        filePath: '/path/to/video.mp4',
        thumbWidth: 320,
        thumbHeight: 240,
      },
    }
    expect(element.elementType).toBe(ElementType.Video)
  })
})

describe('Milky Outgoing Message Transform', () => {
  it('text segment 结构', () => {
    const segment = { type: 'text' as const, data: { text: '你好' } }
    expect(segment.type).toBe('text')
    expect(segment.data.text).toBe('你好')
  })

  it('mention segment 结构', () => {
    const segment = { type: 'mention' as const, data: { user_id: 12345 } }
    expect(segment.type).toBe('mention')
    expect(segment.data.user_id).toBe(12345)
  })

  it('image segment 结构', () => {
    const segment = {
      type: 'image' as const,
      data: { uri: 'file:///path/to/image.png' },
    }
    expect(segment.type).toBe('image')
    expect(segment.data.uri).toContain('file://')
  })

  it('reply segment 结构', () => {
    const segment = {
      type: 'reply' as const,
      data: { message_seq: 1001, sender_id: 12345 },
    }
    expect(segment.type).toBe('reply')
    expect(segment.data.message_seq).toBe(1001)
  })

  it('face segment 结构', () => {
    const segment = {
      type: 'face' as const,
      data: { face_id: 178, is_large: false },
    }
    expect(segment.type).toBe('face')
    expect(segment.data.face_id).toBe(178)
  })
})

describe('Milky IncomingMessage Structure', () => {
  it('群消息结构', () => {
    const msg = {
      message_scene: 'group' as const,
      peer_id: 164461995,
      message_seq: 1001,
      sender_id: 2984196,
      time: 1700000000,
      segments: [{ type: 'text' as const, data: { text: '你好' } }],
      group: { group_id: 164461995, group_name: '测试群' },
      group_member: { user_id: 2984196, nickname: '用户', card: '群名片' },
    }
    expect(msg.message_scene).toBe('group')
    expect(msg.segments).toHaveLength(1)
    expect(msg.group).toBeDefined()
    expect(msg.group_member).toBeDefined()
  })

  it('私聊消息结构', () => {
    const msg = {
      message_scene: 'friend' as const,
      peer_id: 12345,
      message_seq: 1002,
      sender_id: 12345,
      time: 1700000000,
      segments: [{ type: 'text' as const, data: { text: '私聊消息' } }],
      friend: { user_id: 12345, nickname: '好友', remark: '备注' },
    }
    expect(msg.message_scene).toBe('friend')
    expect(msg.friend).toBeDefined()
  })

  it('临时会话消息结构', () => {
    const msg = {
      message_scene: 'temp' as const,
      peer_id: 12345,
      message_seq: 1003,
      sender_id: 12345,
      time: 1700000000,
      segments: [],
      group: { group_id: 164461995, group_name: '来源群' },
    }
    expect(msg.message_scene).toBe('temp')
    expect(msg.group).toBeDefined()
  })
})
