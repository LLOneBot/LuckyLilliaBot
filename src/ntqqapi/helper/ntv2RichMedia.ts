import { InferProtoModel, InferProtoModelInput } from '@saltify/typeproto'
import { ChatType, Peer, PicType } from '../types'
import { Media } from '../proto'
import { getFileType, getImageSize, getMd5HexFromFile, getSha1HexFromFile, getVideoInfo, uint32ToIPV4Addr } from '@/common/utils'
import { randomInt } from 'node:crypto'
import { stat } from 'node:fs/promises'

interface Entity {
  type: 'video' | 'image'
  filePath: string
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
        compatQMsgSceneType: 1,
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
      const { width: w, height: h, time: t } = await getVideoInfo(entity.filePath)
      fileName = `${md5HexStr}.mp4`
      fileType = { type: 2 }
      width = w
      height = h
      time = Math.trunc(t)
      original = 1
    } else if (entity.type === 'image') {
      const { width: w, height: h } = await getImageSize(entity.filePath)
      const { ext } = await getFileType(entity.filePath)
      fileName = `${md5HexStr}.${ext}`
      fileType = {
        type: 1,
        picFormat: ext === 'gif' ? PicType.GIF : PicType.JPEG
      }
      width = w
      height = h
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
    subFileInfo?: InferProtoModel<typeof Media.NTV2RichMediaResp>['upload']['subFileInfos'][number]
  ) {
    const blockSize = 1024 * 1024
    const index = upload.msgInfo.msgInfoBody[0].index
    if (subFileInfo) {
      return {
        fileUuid: index.fileUuid,
        uKey: subFileInfo.uKey,
        network: convertIPv4(subFileInfo.ipv4s),
        msgInfoBody: upload.msgInfo.msgInfoBody,
        blockSize,
        hash: {
          fileSha1: [] as Buffer[]
        }
      } satisfies InferProtoModelInput<typeof Media.NTV2RichMediaHighwayExt>
    } else {
      return {
        fileUuid: index.fileUuid,
        uKey: upload.uKey,
        network: convertIPv4(upload.ipv4s),
        msgInfoBody: upload.msgInfo.msgInfoBody,
        blockSize,
        hash: {
          fileSha1: [] as Buffer[]
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
