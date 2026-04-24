import { describe, it, expect } from 'vitest'
import { decodeUser, decodeGuildMember, decodeGuild } from '@/satori/utils'

describe('Satori Utils', () => {
  describe('decodeUser', () => {
    it('普通用户解码', () => {
      const user = decodeUser({ uin: '12345', nick: '测试用户' })
      expect(user.id).toBe('12345')
      expect(user.name).toBe('测试用户')
      expect(user.avatar).toContain('12345')
      expect(user.is_bot).toBe(false)
    })

    it('带备注的用户', () => {
      const user = decodeUser({ uin: '12345', nick: '测试用户', remark: '备注名' })
      expect(user.id).toBe('12345')
      expect(user.name).toBe('测试用户')
    })

    it('官方机器人 UIN 检测', () => {
      // 3328144510 是官方机器人 UIN
      const bot = decodeUser({ uin: '3328144510', nick: 'QQBot' })
      expect(bot.is_bot).toBe(true)
    })

    it('机器人 UIN 范围检测 (2854196301-2854216399)', () => {
      const bot = decodeUser({ uin: '2854200000', nick: 'Bot' })
      expect(bot.is_bot).toBe(true)
    })

    it('非机器人 UIN', () => {
      const user = decodeUser({ uin: '100000', nick: 'Human' })
      expect(user.is_bot).toBe(false)
    })

    it('头像 URL 格式', () => {
      const user = decodeUser({ uin: '999', nick: 'test' })
      expect(user.avatar).toBe('http://q.qlogo.cn/headimg_dl?dst_uin=999&spec=640')
    })
  })

  describe('decodeGuildMember', () => {
    it('普通成员解码', () => {
      const member = decodeGuildMember({
        uin: '12345',
        nick: '昵称',
        cardName: '群名片',
        role: 2,
        joinTime: 1700000000,
      } as any)

      expect(member.nick).toBe('群名片')
      expect(member.user!.id).toBe('12345')
      expect(member.joined_at).toBe(1700000000000)
      expect(member.roles![0].id).toBe('2')
      expect(member.roles![0].name).toBe('member')
    })

    it('管理员角色', () => {
      const member = decodeGuildMember({
        uin: '12345', nick: '管理', cardName: '', role: 3, joinTime: 0,
      } as any)
      expect(member.roles![0].name).toBe('admin')
    })

    it('群主角色', () => {
      const member = decodeGuildMember({
        uin: '12345', nick: '群主', cardName: '', role: 4, joinTime: 0,
      } as any)
      expect(member.roles![0].name).toBe('owner')
    })

    it('无群名片时使用昵称', () => {
      const member = decodeGuildMember({
        uin: '12345', nick: '昵称', cardName: '', role: 2, joinTime: 0,
      } as any)
      expect(member.nick).toBe('昵称')
    })
  })

  describe('decodeGuild', () => {
    it('群组解码', () => {
      const guild = decodeGuild({ groupCode: '123456789', groupName: '测试群' })
      expect(guild.id).toBe('123456789')
      expect(guild.name).toBe('测试群')
      expect(guild.avatar).toBe('https://p.qlogo.cn/gh/123456789/123456789/640')
    })
  })
})
