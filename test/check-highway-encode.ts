import { Media } from '../src/ntqqapi/proto'

// 测试 1：只设必要字段
const buf1 = Media.ReqDataHighwayHead.encode({
  msgBaseHead: { version: 1, uin: '123', command: 'PicUp.DataUp', seq: 1, retryTimes: 0, appId: 1600001615, dataFlag: 16, commandId: 1001 },
  msgSegHead: { serviceId: 0, filesize: 100, dataOffset: 0, dataLength: 100, serviceTicket: Buffer.from('00', 'hex'), md5: Buffer.alloc(16), fileMd5: Buffer.alloc(16), cacheAddr: 0, cachePort: 0 },
  bytesReqExtendInfo: Buffer.alloc(0),
  timestamp: 0,
  msgLoginSigHead: { uint32LoginSigType: 8, appId: 1600001615 },
})
console.log('full set hex:', Buffer.from(buf1).toString('hex'))
console.log('len:', buf1.length)

// 测试 2：去掉 default 值字段
const buf2 = Media.ReqDataHighwayHead.encode({
  msgBaseHead: { version: 1, uin: '123', command: 'PicUp.DataUp', seq: 1, retryTimes: 0, appId: 1600001615, dataFlag: 16, commandId: 1001 },
  msgSegHead: { filesize: 100, dataOffset: 0, dataLength: 100, serviceTicket: Buffer.from('00', 'hex'), md5: Buffer.alloc(16), fileMd5: Buffer.alloc(16) } as any,
  bytesReqExtendInfo: Buffer.alloc(0),
  timestamp: 0,
  msgLoginSigHead: { uint32LoginSigType: 8, appId: 1600001615 },
})
console.log('minimal hex:', Buffer.from(buf2).toString('hex'))
console.log('len:', buf2.length)
