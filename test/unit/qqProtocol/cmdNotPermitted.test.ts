import { describe, it, expect, vi } from 'vitest'

vi.mock('@/main/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: () => Buffer.alloc(16, 0x11),
}))

import { DirectProtocolClient, SessionInfo } from '@/main/qqProtocol/direct-lib/client'
import { isCmdNotPermitted, CmdNotPermittedError } from '@/common/protocolErrors'

function int32(v: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeInt32BE(v)
  return b
}

function buildResponseFrame(opts: { seq: number; retCode: number; extraMsg?: string; cmd: string }): Buffer {
  const extra = Buffer.from(opts.extraMsg ?? '')
  const cmd = Buffer.from(opts.cmd)
  const head = Buffer.concat([
    int32(0),
    int32(opts.seq),
    int32(opts.retCode),
    int32(extra.length + 4), extra,
    int32(cmd.length + 4), cmd,
  ])
  head.writeInt32BE(head.length, 0)
  const uin = Buffer.from('10000')
  return Buffer.concat([
    int32(12),
    Buffer.from([0x00, 0x00]),
    int32(uin.length + 4), uin,
    head,
    int32(4),
  ])
}

function fakeSession(): SessionInfo {
  return {
    uin: '10000',
    uid: 'u_test',
    d2: Buffer.alloc(0),
    d2Key: Buffer.alloc(16),
    tgt: Buffer.alloc(0),
    a2: Buffer.alloc(0),
    a2Key: Buffer.alloc(16),
    sKey: Buffer.alloc(0),
  }
}

const CMD = 'OidbSvcTrpcTcp.0xfe7_3'

/** 把一条在飞请求挂进 pendingPackets, 再喂回一个错误帧, 返回它 reject 出来的错误。 */
function rejectWith(client: DirectProtocolClient, retCode: number, extraMsg: string): Promise<Error> {
  const pending = (client as unknown as {
    pendingPackets: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }>
  }).pendingPackets
  const settled = new Promise<Error>((res) => {
    pending.set(7, { resolve: () => {}, reject: res as (e: Error) => void, timeout: setTimeout(() => {}, 0) })
  })
  ;(client as unknown as { handlePacket(f: Buffer): void }).handlePacket(
    buildResponseFrame({ seq: 7, retCode, extraMsg, cmd: CMD }),
  )
  return settled
}

describe('产品线无 cmd 权限 (retCode=-10122)', () => {
  it('抛出可辨识的错误, 而不是笼统的请求失败', async () => {
    const client = new DirectProtocolClient()
    client.setSession(fakeSession())
    const error = await rejectWith(client, -10122, 'Product does not have permission to access cmd')
    expect(isCmdNotPermitted(error)).toBe(true)
    expect((error as CmdNotPermittedError).cmd).toBe(CMD)
  })

  it('记住之后直接短路, 不再发注定被拒的包', async () => {
    const client = new DirectProtocolClient()
    client.setSession(fakeSession())
    await rejectWith(client, -10122, 'Product does not have permission to access cmd')

    const conn = (client as unknown as { conn: { send(b: Buffer): void } }).conn
    const send = vi.spyOn(conn, 'send').mockImplementation(() => {})
    await expect(client.sendCommand(CMD, Buffer.alloc(0))).rejects.toSatisfy(isCmdNotPermitted)
    expect(send).not.toHaveBeenCalled()
  })

  it('错误信息是给用户看的人话, 不是 cmd 名', async () => {
    const client = new DirectProtocolClient()
    client.setSession(fakeSession())
    const error = await rejectWith(client, -10122, 'Product does not have permission to access cmd')
    // 测试环境 getProtocol mock 成 linux; 登记过的 cmd 走精确文案
    expect(error.message).toBe('Linux协议不支持获取群成员列表')
    expect(error.message).not.toContain('0xfe7_3')
  })

  it('没登记的 cmd 退回通用文案, 功能不受影响', async () => {
    const client = new DirectProtocolClient()
    client.setSession(fakeSession())
    const pending = (client as unknown as {
      pendingPackets: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }>
    }).pendingPackets
    const settled = new Promise<Error>((res) => {
      pending.set(9, { resolve: () => {}, reject: res as (e: Error) => void, timeout: setTimeout(() => {}, 0) })
    })
    ;(client as unknown as { handlePacket(f: Buffer): void }).handlePacket(
      buildResponseFrame({ seq: 9, retCode: -10122, extraMsg: '', cmd: 'OidbSvcTrpcTcp.0x9999_1' }),
    )
    const error = await settled
    expect(isCmdNotPermitted(error)).toBe(true)
    expect(error.message).toBe('Linux协议不支持此操作 (OidbSvcTrpcTcp.0x9999_1)')
  })

  it('别的错误码照旧当普通请求失败', async () => {
    const client = new DirectProtocolClient()
    client.setSession(fakeSession())
    const error = await rejectWith(client, -20003, 'boom')
    expect(isCmdNotPermitted(error)).toBe(false)
    expect(error.message).toContain('retCode=-20003')
  })
})
