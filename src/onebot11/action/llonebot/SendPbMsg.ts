import { OB11MessageKeyboard, OB11MessageText } from '../../types'
import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { readFile, access } from 'fs/promises'
import { resolve } from 'path'
import protobuf from '@/ntqqapi/proto/compiled'
import { Peer, ChatType } from '@/ntqqapi/types'
import { Logger } from 'cordis'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

class WasmModule {
  private constructor(
    private wasmPath: string,
    private instance: WebAssembly.Instance,
    private memory: WebAssembly.Memory
  ) {}

  static async create(wasmPath: string): Promise<WasmModule> {
    const fullPath = resolve(wasmPath)
    const buffer = await readFile(fullPath)
    const { instance } = await WebAssembly.instantiate(buffer)

    const memory = instance.exports.memory
    if (!(memory instanceof WebAssembly.Memory)) {
      throw new Error('Exported memory not found or invalid')
    }

    return new WasmModule(wasmPath, instance, memory)
  }

  get exports() {
    return this.instance.exports
  }

  writeString(str: string): number {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(`${str}\0`)
    const malloc = this.exports.malloc as (size: number) => number
    const ptr = malloc(bytes.length)
    new Uint8Array(this.memory.buffer, ptr, bytes.length).set(bytes)
    return ptr
  }

  readCString(ptr: number): string {
    const mem = new Uint8Array(this.memory.buffer)
    let end = ptr
    while (mem[end] !== 0) end++
    return new TextDecoder().decode(mem.slice(ptr, end))
  }

  free(ptr: number): void {
    const free = this.exports.free_ptr as (ptr: number) => void
    free(ptr)
  }
}

interface ReturnData {
  message_id: number
}

interface Payload {
  message_type?: 'private' | 'group' | 'user'
  user_id?: string | number
  group_id?: string | number
  peer_id?: number
  message?: (OB11MessageKeyboard | OB11MessageText)[]
  messages?: (OB11MessageKeyboard | OB11MessageText)[]
  seq?: number
  random_number?: number
}

export class SendPbMsg extends BaseAction<Payload, ReturnData> {
  actionName = ActionName.SendPbMsg

  protected async _handle(payload: Payload): Promise<ReturnData> {
    payload.message = payload.message || payload.messages

    if (payload.message_type === 'private') payload.message_type = 'user'

    payload.seq ??= Math.floor(Math.random() * 0xffffffff)
    payload.random_number ??= Math.floor(Math.random() * 0xffffffff)

    if (payload.group_id) {
      payload.peer_id = Number(payload.group_id)
      payload.message_type = 'group'
    } else if (payload.user_id) {
      payload.peer_id = Number(payload.user_id)
      payload.message_type = 'user'
    } else if (!(payload.peer_id && payload.message_type)) {
      throw new Error('请输入user_id或group_id。')
    }
    // 开始wasm操作
    const wasmPath = (await fileExists('./qq_msg_encoding.wasm'))
      ? './qq_msg_encoding.wasm'
      : './public/qq_msg_encoding.wasm'

    let wasm:null | WasmModule = await WasmModule.create(wasmPath)
    const payloadStr = JSON.stringify(payload)
    const payloadPtr = wasm.writeString(payloadStr)

    const encodeFromJson = wasm.exports.encode_from_json as (ptr: number) => number
    const resultPtr = encodeFromJson(payloadPtr)

    if (resultPtr === 0) {
      throw new Error('无法解析的数据,请检查输入')
    }

    const hexResult = wasm.readCString(resultPtr)

    wasm.free(payloadPtr)
    wasm.free(resultPtr)
    wasm = null
    // 结束wasm操作
    const result = await this.ctx.app.pmhq.sendPB('MessageSvc.PbSendMsg', hexResult)
    const data = protobuf.Msg.SendMsgRsp.decode(Buffer.from(result.pb, 'hex'))

    if (data.retCode !== 0) {
      const msg = `消息发送失败, errMsg: ${data.errMsg}, 原始hex: ${result}`
      this.ctx.logger.error(msg)
      throw new Error(msg)
    }

    let returnRawMsg
    if (payload.message_type == "group") {
      const peer: Peer = {
        chatType: ChatType.Group,
        peerUid: String(payload.peer_id),
        guildId: ''
      }
      this.ctx.logger.info(peer)
      returnRawMsg = (await this.ctx.ntMsgApi.getMsgsBySeqAndCount(peer, String(data.groupSeq), 1, true, true))
    } else if (payload.message_type == "user") {
      const peer: Peer = {
        chatType: ChatType.C2C,
        peerUid: await this.ctx.ntUserApi.getUidByUin(String(payload.peer_id)),
        guildId: ''
      }
      returnRawMsg = (await this.ctx.ntMsgApi.getMsgsBySeqAndCount(peer, String(data.privateSeq), 1, true, true))
    }

    if (!returnRawMsg?.msgList[0]) {
      const msg = `消息发送成功,结果解析失败,返回hex:${result},ntqqapi调用结果:${JSON.stringify(returnRawMsg)}`
      this.ctx.logger.error(msg)
      throw new Error(msg)
    }

    const msgShortId = this.ctx.store.createMsgShortId({
      chatType: returnRawMsg.msgList[0].chatType,
      peerUid: returnRawMsg.msgList[0].peerUid
    }, returnRawMsg.msgList[0].msgId)
    return { message_id: msgShortId }
  }
}

export default SendPbMsg
