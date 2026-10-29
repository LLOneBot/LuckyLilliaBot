// Legacy MSF JCE service: on a fresh SSO connection the server pushes ConfigPushSvc.PushReq and real QQ
// answers PushResp echoing {type, seq}. The body is byte-exact to a captured real PushResp.
import { JceReader, jceByte, jceZero, jceString, jceSimpleList, jceStruct, jceLong, jceMap } from './jce'

export const CONFIG_PUSH_REQ = 'ConfigPushSvc.PushReq'
export const CONFIG_PUSH_RESP = 'ConfigPushSvc.PushResp'
const SERVANT = 'QQService.ConfigPushSvc.MainServant'

// RequestPacket.sBuffer(tag7) = UniAttribute{"PushReq":{"ConfigPush.PushReq": struct}},
// struct = { tag1 BYTE type, tag2 SIMPLE_LIST jcebuf, tag3 LONG seq }
export function parseConfigPushReq(payload: Buffer): { type: number; seq: number } | null {
  try {
    const top = new JceReader(payload).decodeAll()
    const sBuffer = top[7]
    if (!Buffer.isBuffer(sBuffer)) return null
    const uni = new JceReader(sBuffer).readField().value as Map<unknown, unknown>
    const lvl2 = [...uni.values()][0] as Map<unknown, unknown>
    const structBuf = [...lvl2.values()][0] as Buffer
    if (!Buffer.isBuffer(structBuf)) return null
    const st = new JceReader(structBuf).readField().value as Record<number, unknown>
    return { type: Number(st[1] ?? 1), seq: Number(st[3] ?? 0) }
  } catch {
    return null
  }
}

export function buildConfigPushResp(type: number, seq: number): Buffer {
  const inner = jceStruct(0, Buffer.concat([
    jceByte(1, type),
    jceLong(2, seq),
    jceSimpleList(3, Buffer.alloc(0)), // jcebuf empty for type=1
  ]))
  const lvl2 = jceMap(1, [[jceString(0, 'ConfigPush.PushResp'), jceSimpleList(1, inner)]])
  const sBuffer = jceMap(0, [[jceString(0, 'PushResp'), lvl2]])
  return Buffer.concat([
    jceByte(1, 2),        // iVersion = 2
    jceZero(2), jceZero(3), jceZero(4),
    jceString(5, SERVANT),
    jceString(6, 'PushRes'), // sFuncName: real wire is "PushRes" (7 chars), not "PushResp"
    jceSimpleList(7, sBuffer),
    jceZero(8),           // iTimeout = 0
    jceMap(9, []),        // context = {}
    jceMap(10, []),       // status  = {}
  ])
}
