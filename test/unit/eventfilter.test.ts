import { describe, it, expect } from 'vitest'
import { matchEventFilter } from '@/onebot11/eventfilter'

// 构造测试用的 OB11 事件
function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    time: 1700000000,
    self_id: 123456,
    post_type: 'message',
    message_type: 'group',
    sub_type: 'normal',
    message_id: 1001,
    group_id: 164461995,
    user_id: 2984196,
    raw_message: '你好世界',
    ...overrides,
  } as any
}

describe('matchEventFilter', () => {
  describe('空过滤器', () => {
    it('filter 为 undefined 时应返回 true', () => {
      expect(matchEventFilter(undefined, makeEvent())).toBe(true)
    })

    it('filter 为 null 时应返回 true', () => {
      expect(matchEventFilter(null, makeEvent())).toBe(true)
    })
  })

  describe('简单等于匹配 ($eq)', () => {
    it('单字段匹配', () => {
      expect(matchEventFilter({ post_type: 'message' }, makeEvent())).toBe(true)
    })

    it('单字段不匹配', () => {
      expect(matchEventFilter({ post_type: 'notice' }, makeEvent())).toBe(false)
    })

    it('多条件 AND 匹配', () => {
      expect(matchEventFilter(
        { post_type: 'message', message_type: 'group' },
        makeEvent()
      )).toBe(true)
    })

    it('多条件 AND 部分不匹配', () => {
      expect(matchEventFilter(
        { post_type: 'message', message_type: 'private' },
        makeEvent()
      )).toBe(false)
    })

    it('数字字段匹配', () => {
      expect(matchEventFilter({ group_id: 164461995 }, makeEvent())).toBe(true)
    })
  })

  describe('$ne 不等于', () => {
    it('不等于匹配', () => {
      expect(matchEventFilter(
        { post_type: { $ne: 'notice' } },
        makeEvent()
      )).toBe(true)
    })

    it('不等于不匹配', () => {
      expect(matchEventFilter(
        { post_type: { $ne: 'message' } },
        makeEvent()
      )).toBe(false)
    })
  })

  describe('$in 列表匹配', () => {
    it('值在列表中', () => {
      expect(matchEventFilter(
        { group_id: { $in: [164461995, 545402644] } },
        makeEvent()
      )).toBe(true)
    })

    it('值不在列表中', () => {
      expect(matchEventFilter(
        { group_id: { $in: [111, 222] } },
        makeEvent()
      )).toBe(false)
    })
  })

  describe('$nin 不在列表中', () => {
    it('值不在列表中应匹配', () => {
      expect(matchEventFilter(
        { group_id: { $nin: [111, 222] } },
        makeEvent()
      )).toBe(true)
    })

    it('值在列表中应不匹配', () => {
      expect(matchEventFilter(
        { group_id: { $nin: [164461995, 222] } },
        makeEvent()
      )).toBe(false)
    })
  })

  describe('$regex 正则匹配', () => {
    it('正则匹配成功', () => {
      expect(matchEventFilter(
        { raw_message: { $regex: '你好' } },
        makeEvent()
      )).toBe(true)
    })

    it('正则不匹配', () => {
      expect(matchEventFilter(
        { raw_message: { $regex: '^\\d+$' } },
        makeEvent()
      )).toBe(false)
    })

    it('数字正则匹配', () => {
      expect(matchEventFilter(
        { raw_message: { $regex: '\\d+' } },
        makeEvent({ raw_message: 'abc123def' })
      )).toBe(true)
    })
  })

  describe('$gt/$lt 大小比较', () => {
    it('$gt 大于', () => {
      expect(matchEventFilter(
        { user_id: { $gt: 1000 } },
        makeEvent()
      )).toBe(true)
    })

    it('$lt 小于', () => {
      expect(matchEventFilter(
        { user_id: { $lt: 1000 } },
        makeEvent()
      )).toBe(false)
    })
  })

  describe('$and/$or 复合查询', () => {
    it('$or 任一匹配', () => {
      expect(matchEventFilter(
        { $or: [{ post_type: 'notice' }, { post_type: 'message' }] },
        makeEvent()
      )).toBe(true)
    })

    it('$or 全部不匹配', () => {
      expect(matchEventFilter(
        { $or: [{ post_type: 'notice' }, { post_type: 'request' }] },
        makeEvent()
      )).toBe(false)
    })

    it('$and 全部匹配', () => {
      expect(matchEventFilter(
        { $and: [{ post_type: 'message' }, { message_type: 'group' }] },
        makeEvent()
      )).toBe(true)
    })

    it('$not 取反', () => {
      expect(matchEventFilter(
        { post_type: { $not: { $eq: 'notice' } } },
        makeEvent()
      )).toBe(true)
    })
  })

  describe('无效过滤器', () => {
    it('无效 filter 应返回 false', () => {
      expect(matchEventFilter({ $invalidOp: 123 } as any, makeEvent())).toBe(false)
    })
  })

  describe('组合场景', () => {
    it('群号列表 + 正则匹配', () => {
      expect(matchEventFilter(
        {
          group_id: { $in: [164461995, 545402644] },
          raw_message: { $regex: '你好' }
        },
        makeEvent()
      )).toBe(true)
    })

    it('群号列表 + 正则不匹配', () => {
      expect(matchEventFilter(
        {
          group_id: { $in: [164461995] },
          raw_message: { $regex: '^\\d+$' }
        },
        makeEvent()
      )).toBe(false)
    })

    it('只过滤私聊消息', () => {
      expect(matchEventFilter(
        { post_type: 'message', message_type: 'private' },
        makeEvent({ message_type: 'private' })
      )).toBe(true)

      expect(matchEventFilter(
        { post_type: 'message', message_type: 'private' },
        makeEvent({ message_type: 'group' })
      )).toBe(false)
    })
  })
})
