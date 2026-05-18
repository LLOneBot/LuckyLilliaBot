import { Context } from 'cordis'
import LoggerService from '@cordisjs/plugin-logger'
import TimerService from '@cordisjs/plugin-timer'
import ConfigService from '../src/main/config'
import { QQProtocolClient } from '../src/main/qqProtocol'
import { selfInfo } from '../src/common/globalVars'
import { Oidb } from '../src/ntqqapi/proto'

async function main() {
  const ctx = new Context()
  ctx.plugin(LoggerService, { bufferSize: 0 })
  ctx.plugin(TimerService)
  ctx.plugin(ConfigService)
  ctx.plugin(QQProtocolClient)
  await new Promise<void>(r => ctx.inject(['qqProtocol'], (c) => c.qqProtocol.initDirectClient().then(() => r())))
  await new Promise(r => setTimeout(r, 2000))

  const TEST_UIN = +(process.env.QQ_TEST_UIN || '379450326')
  const TEST_UID = process.env.QQ_TEST_UID || 'u_snYxnEfja-Po_cdFcyccRQ'

  console.log(`Logged in as ${selfInfo.uin} / ${selfInfo.uid}\n`)

  // 用 0xfe1_2 (by UID) 直接发包，dump 原始响应
  for (const [label, uid] of [['other', TEST_UID], ['self', selfInfo.uid]] as const) {
    console.log(`\n=== 0xfe1_2 by UID [${label}] uid=${uid} ===`)
    const body = Oidb.FetchUserInfoByUidReq.encode({
      uid,
      keys: [
        { key: 102 }, { key: 103 }, { key: 104 }, { key: 105 }, { key: 107 },
        { key: 20002 }, { key: 20009 }, { key: 20037 }, { key: 27394 },
      ],
    })
    console.log(`Req body hex: ${Buffer.from(body).toString('hex')}`)
    const data = Oidb.Base.encode({ command: 0xfe1, subCommand: 2, body })
    console.log(`Wrapped Oidb hex: ${Buffer.from(data).toString('hex')}`)
    const res = await ctx.qqProtocol.sendPB('OidbSvcTrpcTcp.0xfe1_2', data)
    const respBuf = Buffer.from(res.pb, 'hex')
    const baseDecoded = Oidb.Base.decode(respBuf)
    console.log(`Base.errorCode=${baseDecoded.errorCode}, errorMsg="${baseDecoded.errorMsg}"`)
    console.log(`Base.body length: ${baseDecoded.body.length}`)
    console.log(`Base.body hex (first 256B): ${Buffer.from(baseDecoded.body).slice(0, 256).toString('hex')}`)
    try {
      const info = Oidb.FetchUserInfoResp.decode(Buffer.from(baseDecoded.body))
      console.log('Decoded with FetchUserInfoResp:')
      console.log('  uin:', info.body.uin)
      console.log('  numberProperties:', info.body.properties.numberProperties.map((p: any) => ({ key: p.key, value: p.value })))
      const bytesProps = info.body.properties.bytesProperties.map((p: any) => ({
        key: p.key, value: Buffer.from(p.value).toString('utf8') || `<${p.value.length}B>`
      }))
      console.log('  bytesProperties:', bytesProps)
    } catch (e) {
      console.log('FetchUserInfoResp decode failed:', (e as Error).message)
    }
  }

  // by UIN 自己 也 dump
  console.log(`\n=== 0xfe1_1 by UIN [self] uin=${selfInfo.uin} ===`)
  const body2 = Oidb.FetchUserInfoReq.encode({
    uin: +selfInfo.uin,
    keys: [
      { key: 102 }, { key: 103 }, { key: 105 }, { key: 107 },
      { key: 20002 }, { key: 20009 }, { key: 20037 }, { key: 27394 },
    ],
  })
  const data2 = Oidb.Base.encode({ command: 0xfe1, subCommand: 1, body: body2, isReserved: 1 })
  const res2 = await ctx.qqProtocol.sendPB('OidbSvcTrpcTcp.0xfe1_1', data2)
  const baseDecoded2 = Oidb.Base.decode(Buffer.from(res2.pb, 'hex'))
  console.log(`Base.errorCode=${baseDecoded2.errorCode}, errorMsg="${baseDecoded2.errorMsg}"`)
  console.log(`Base.body hex: ${Buffer.from(baseDecoded2.body).toString('hex')}`)
  try {
    const info = Oidb.FetchUserInfoResp.decode(Buffer.from(baseDecoded2.body))
    console.log('Decoded:', JSON.stringify(info, null, 2).slice(0, 800))
  } catch (e) {
    console.log('decode failed:', (e as Error).message)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })

