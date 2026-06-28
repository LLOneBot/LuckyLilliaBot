import { InferProtoModel, InferProtoModelInput } from '@saltify/typeproto'
import { ChatType, Peer } from '../types'
import { Media } from '../proto'
import { getFileType, getImageSize, getMd5HexFromFile, getSha1HexFromFile, getVideoInfo, uint32ToIPV4Addr } from '@/common/utils'
import { randomInt } from 'node:crypto'
import { stat } from 'node:fs/promises'

interface Entity {
  type: 'video' | 'image' | 'voice'
  filePath: string
  duration?: number  // for voice (seconds), or video (seconds)
  width?: number     // for video (px), or image (px)
  height?: number    // for video (px), or image (px)
}

export namespace NTV2RichMedia {
  export async function buildUploadReq(
    peer: Peer,
    entity: Entity,
    ext: InferProtoModelInput<typeof Media.ExtBizInfo>,
    subFileInfos: [number, Entity][] = []
  ) {
    let requestType, businessType
    if (entity.type === 'video') {
      requestType = 2
      businessType = 2
    } else if (entity.type === 'image') {
      requestType = 2
      businessType = 1
    } else if (entity.type === 'voice') {
      requestType = 2
      businessType = 3
    }
    const isGroup = peer.chatType === ChatType.Group
    return Media.NTV2RichMediaReq.encode({
      reqHead: {
        common: {
          requestId: 1,
          command: 100
        },
        scene: {
          requestType,
          businessType,
          sceneType: isGroup ? 2 : 1,
          group: isGroup ? { groupId: +peer.peerUid } : undefined,
          c2c: !isGroup ? { accountType: 2, targetUid: peer.peerUid } : undefined
        },
        client: {
          agentType: 2
        }
      },
      upload: {
        uploadInfo: [
          {
            fileInfo: await buildFileInfo(entity),
            subFileType: 0
          },
          ... (await Promise.all(
            subFileInfos.map(async ([subFileType, subEntity]) => ({
              fileInfo: await buildFileInfo(subEntity),
              subFileType
            }))
          ))
        ],
        tryFastUploadCompleted: true,
        srvSendMsg: false,
        clientRandomId: randomInt(0, 0x7fffffff),
        compatQMsgSceneType: isGroup ? 2 : 1,
        clientSeq: 10,
        extBizInfo: ext,
        noNeedCompatMsg: false
      }
    })
  }

  async function buildFileInfo(entity: Entity) {
    const md5HexStr = await getMd5HexFromFile(entity.filePath)
    const sha1HexStr = await getSha1HexFromFile(entity.filePath)
    const { size: fileSize } = await stat(entity.filePath)
    let fileName, fileType, width, height, time, original
    if (entity.type === 'video') {
      // Type 2 + FileName + FileSize + sha1/md5 + Time (视频时长) + Width/Height (视频分辨率)
      fileName = `${md5HexStr}.mp4`
      fileType = { type: 2 }
      time = entity.duration ?? 0
      width = entity.width ?? 0
      height = entity.height ?? 0
    } else if (entity.type === 'image') {
      const { ext } = await getFileType(entity.filePath)
      fileName = `${md5HexStr}.${ext}`
      fileType = {
        type: 1,
        picFormat: ext === 'gif' ? 2000 : 1000
      }
      width = entity.width ?? 0
      height = entity.height ?? 0
      original = 1
    } else if (entity.type === 'voice') {
      fileName = `${md5HexStr}.amr`
      fileType = { type: 3, pttFormat: 1 }
      time = entity.duration ?? 1
      original = 1
    }

    return {
      fileSize,
      md5HexStr,
      sha1HexStr,
      fileName,
      fileType,
      width,
      height,
      time,
      original
    } satisfies InferProtoModelInput<typeof Media.FileInfo>
  }

  export function generateExt(
    upload: InferProtoModel<typeof Media.NTV2RichMediaResp>['upload'],
    subFileInfo?: InferProtoModel<typeof Media.NTV2RichMediaResp>['upload']['subFileInfos'][0]
  ) {
    const blockSize = 1024 * 1024
    // upload.msgInfo 现在是 bytes（NTV2RichMediaResp.upload.msgInfo 改成 raw 透传），
    // 这里解析一次给 highway ext 用
    const msgInfoStruct = Media.MsgInfo.decode(upload.msgInfo)
    const head = msgInfoStruct.msgInfoBody[0]
    if (!head?.index) {
      // 服务端返回的 msgInfo 没有有效 fileInfo（常见原因：preflight 失败、非好友 c2c 拒绝上传等）
      throw new Error(`NTV2 generateExt: server response 缺少 msgInfoBody[0].index，无法生成 highway ext (uKey=${upload.uKey ?? '?'}, msgInfoBody.length=${msgInfoStruct.msgInfoBody?.length ?? 0})`)
    }
    const index = head.index
    const initialSha1: Buffer[] = index.info?.sha1HexStr
      ? [Buffer.from(index.info.sha1HexStr, 'hex')]
      : [Buffer.alloc(0)]
    if (subFileInfo) {
      const subIndex = msgInfoStruct.msgInfoBody[1]?.index
      const subInitialSha1: Buffer[] = subIndex?.info?.sha1HexStr
        ? [Buffer.from(subIndex.info.sha1HexStr, 'hex')]
        : initialSha1
      return {
        fileUuid: index.fileUuid,
        uKey: subFileInfo.uKey,
        network: convertIPv4(subFileInfo.ipv4s),
        msgInfoBody: msgInfoStruct.msgInfoBody,
        blockSize,
        hash: {
          fileSha1: subInitialSha1
        }
      } satisfies InferProtoModelInput<typeof Media.NTV2RichMediaHighwayExt>
    } else {
      return {
        fileUuid: index.fileUuid,
        uKey: upload.uKey,
        network: convertIPv4(upload.ipv4s),
        msgInfoBody: msgInfoStruct.msgInfoBody,
        blockSize,
        hash: {
          fileSha1: initialSha1
        }
      } satisfies InferProtoModelInput<typeof Media.NTV2RichMediaHighwayExt>
    }
  }

  function convertIPv4(ipv4s: InferProtoModel<typeof Media.NTV2RichMediaResp>['upload']['ipv4s']) {
    return {
      ipv4s: ipv4s.map(ipv4 => ({
        domain: {
          isEnable: true,
          ip: uint32ToIPV4Addr(ipv4.outIP)
        },
        port: ipv4.outPort
      }))
    } satisfies InferProtoModelInput<typeof Media.NTHighwayNetwork>
  }
}
