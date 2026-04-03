import { AtType, ChatType, FaceIndex, FaceType, Peer, RawMessage } from '@/ntqqapi/types'
import { encodeCQCode } from '@/onebot11/cqcode'
import { OB11MessageData, OB11MessageDataType } from '@/onebot11/types'
import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import { pathToFileURL } from 'node:url'

export async function transformIncomingSegments(
  ctx: Context,
  message: RawMessage,
  rootMsgID?: string,
  peer?: Peer
): Promise<{ segments: OB11MessageData[], cqCode: string }> {
  const segments: OB11MessageData[] = []
  let cqCode = ''

  for (const element of message.elements) {
    let messageSegment: OB11MessageData | undefined
    if (element.textElement && element.textElement?.atType !== AtType.Unknown) {
      let qq: string
      let name: string | undefined
      if (element.textElement.atType === AtType.All) {
        qq = 'all'
      } else {
        const { atNtUid, atUid, content } = element.textElement
        if (atUid && atUid !== '0') {
          qq = atUid
        } else {
          qq = await ctx.ntUserApi.getUinByUid(atNtUid)
        }
        name = content.replace('@', '')
      }
      messageSegment = {
        type: OB11MessageDataType.At,
        data: {
          qq,
          name
        }
      }
    }
    else if (element.textElement) {
      const text = element.textElement.content
      if (!text) {
        continue
      }
      messageSegment = {
        type: OB11MessageDataType.Text,
        data: {
          text
        }
      }
    }
    else if (element.replyElement) {
      const { replyElement } = element
      const peer = {
        chatType: message.chatType,
        peerUid: message.peerUid,
        guildId: ''
      }
      try {
        const { replayMsgSeq, replyMsgTime, sourceMsgIdInRecords, senderUidStr } = replyElement
        const record = message.records.find(msgRecord => msgRecord.msgId === sourceMsgIdInRecords)
        const { msgList } = await ctx.ntMsgApi.queryMsgsWithFilterExBySeq(peer, replayMsgSeq, replyMsgTime, [senderUidStr])

        let replyMsg: RawMessage | undefined
        if (record && record.msgRandom !== '0') {
          replyMsg = msgList.find((msg: RawMessage) => msg.msgRandom === record.msgRandom)
        } else {
          if (msgList.length > 0) {
            replyMsg = msgList[0]
          } else if (record) {
            if (record.senderUin && record.senderUin !== '0') {
              peer.chatType = record.chatType
              peer.peerUid = record.peerUid
              ctx.store.addMsgCache(record)
            }
            ctx.logger.info('msgList is empty, use record', replyElement, record)
            replyMsg = record
          }
        }
        if (!replyMsg) {
          ctx.logger.error('获取不到引用的消息', replyElement, record)
          continue
        }

        messageSegment = {
          type: OB11MessageDataType.Reply,
          data: {
            id: ctx.store.createMsgShortId(replyMsg).toString()
          }
        }
      } catch (e) {
        ctx.logger.error('获取不到引用的消息', e, replyElement, (e as Error).stack)
        continue
      }
    }
    else if (element.picElement) {
      const { picElement } = element
      const fileSize = picElement.fileSize ?? '0'
      messageSegment = {
        type: OB11MessageDataType.Image,
        data: {
          file: picElement.fileName,
          subType: picElement.picSubType,
          url: await ctx.ntFileApi.getImageUrl(picElement),
          file_size: fileSize,
        }
      }
      ctx.store.addFileCache({
        peerUid: message.peerUid,
        msgId: message.msgId,
        msgTime: +message.msgTime,
        chatType: message.chatType,
        elementId: element.elementId,
        elementType: element.elementType,
        fileName: picElement.fileName,
        fileUuid: picElement.fileUuid,
        fileSize,
      }).then()
    }
    else if (element.videoElement) {
      const { videoElement } = element
      const videoUrl = await ctx.ntFileApi.getVideoUrl(
        peer ?? {
          chatType: message.chatType,
          peerUid: message.peerUid,
          guildId: ''
        },
        rootMsgID ?? message.msgId,
        element.elementId,
      )
      const fileSize = videoElement.fileSize ?? '0'
      messageSegment = {
        type: OB11MessageDataType.Video,
        data: {
          file: videoElement.fileName,
          url: videoUrl || pathToFileURL(videoElement.filePath).href,
          path: videoElement.filePath,
          file_size: fileSize,
        }
      }
      ctx.store.addFileCache({
        peerUid: message.peerUid,
        msgId: message.msgId,
        msgTime: +message.msgTime,
        chatType: message.chatType,
        elementId: element.elementId,
        elementType: element.elementType,
        fileName: videoElement.fileName,
        fileUuid: videoElement.fileUuid!,
        fileSize,
      }).then()
    }
    else if (element.fileElement) {
      const { fileElement } = element
      const fileSize = fileElement.fileSize ?? '0'
      messageSegment = {
        type: OB11MessageDataType.File,
        data: {
          file: fileElement.fileName,
          url: fileElement.filePath ? pathToFileURL(fileElement.filePath).href : '',
          file_id: fileElement.fileUuid,
          path: fileElement.filePath,
          file_size: fileSize,
        }
      }
      ctx.store.addFileCache({
        peerUid: message.peerUid,
        msgId: message.msgId,
        msgTime: +message.msgTime,
        chatType: message.chatType,
        elementId: element.elementId,
        elementType: element.elementType,
        fileName: fileElement.fileName,
        fileUuid: fileElement.fileUuid!,
        fileSize,
      }).then()
    }
    else if (element.pttElement) {
      const { pttElement } = element
      const fileSize = pttElement.fileSize ?? '0'
      messageSegment = {
        type: OB11MessageDataType.Record,
        data: {
          file: pttElement.fileName,
          url: await ctx.ntFileApi.getPttUrl(pttElement.fileUuid, message.chatType === ChatType.Group),
          path: pttElement.filePath,
          file_size: fileSize,
        }
      }
      ctx.store.addFileCache({
        peerUid: message.peerUid,
        msgId: message.msgId,
        msgTime: +message.msgTime,
        chatType: message.chatType,
        elementId: element.elementId,
        elementType: element.elementType,
        fileName: pttElement.fileName,
        fileUuid: pttElement.fileUuid,
        fileSize,
      }).then()
    }
    else if (element.arkElement) {
      const { arkElement } = element
      try {
        const data = JSON.parse(arkElement.bytesData)
        if (data.app === 'com.tencent.multimsg') {
          messageSegment = {
            type: OB11MessageDataType.Forward,
            data: {
              id: message.msgId
            }
          }
        } else {
          messageSegment = {
            type: OB11MessageDataType.Json,
            data: {
              data: arkElement.bytesData
            }
          }
        }
      } catch { }
    }
    else if (element.faceElement) {
      const { faceElement } = element
      const { faceIndex, faceType } = faceElement
      if (faceType === FaceType.Poke && faceIndex === 1) {
        messageSegment = {
          type: OB11MessageDataType.Shake,
          data: {}
        }
      }
      else {
        if (faceIndex === FaceIndex.Dice) {
          messageSegment = {
            type: OB11MessageDataType.Dice,
            data: {
              result: faceElement.resultId!
            }
          }
        }
        else if (faceIndex === FaceIndex.RPS) {
          messageSegment = {
            type: OB11MessageDataType.Rps,
            data: {
              result: faceElement.resultId!
            }
          }
          /*} else if (faceIndex === 1 && pokeType === 1) {
            messageSegment = {
              type: OB11MessageDataType.shake,
              data: {}
            }*/
        }
        else {
          messageSegment = {
            type: OB11MessageDataType.Face,
            data: {
              id: faceIndex.toString(),
              sub_type: faceType
            }
          }
        }
      }
    }
    else if (element.marketFaceElement) {
      const { marketFaceElement } = element
      const { emojiId } = marketFaceElement
      // 取md5的前两位
      const dir = emojiId.substring(0, 2)
      // 获取组装url
      // const url = `https://p.qpic.cn/CDN_STATIC/0/data/imgcache/htdocs/club/item/parcel/item/${dir}/${md5}/300x300.gif?max_age=31536000`
      const url = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw300.gif`
      messageSegment = {
        type: OB11MessageDataType.Mface,
        data: {
          summary: marketFaceElement.faceName!,
          url,
          emoji_id: emojiId,
          emoji_package_id: marketFaceElement.emojiPackageId,
          key: marketFaceElement.key
        }
      }
    }
    else if (element.markdownElement) {
      const { markdownElement } = element
      // todo: 解析闪传 markdown 获取 fileSetId
      if (markdownElement?.content.startsWith('[闪传](')) {
        const mqqapiUrl = markdownElement?.content.substring(5, markdownElement?.content.length - 1)
        const urlJson = new URL(mqqapiUrl).searchParams.get('json')
        if (urlJson) {
          const jsonData = JSON.parse(urlJson)
          const busId = jsonData?.busId
          if (busId === 'FlashTransfer') {
            const attributes: Dict[] = jsonData?.attributes?.attributes || []
            const fileAttribute = attributes.find(a => a.viewId === 'file')
            if (fileAttribute) {
              const urlParams = new URL(fileAttribute.schema).searchParams
              const fileSetId = urlParams.get('fileset_id') || ''
              const sceneType = urlParams.get('scene_type') || ''
              const fileSubAttributes: Dict[] = fileAttribute?.attributes || []
              const titleAttribute = fileSubAttributes.find(a => a.viewId === 'title')
              const title: string = titleAttribute?.text
              messageSegment = {
                type: OB11MessageDataType.FlashFile,
                data: {
                  title,
                  file_set_id: fileSetId,
                  scene_type: +sceneType
                }
              }
            }
          }
        }
      }
      else {
        messageSegment = {
          type: OB11MessageDataType.Markdown,
          data: {
            content: markdownElement.content
          }
        }
      }
    }
    else if (element.multiForwardMsgElement) {
      messageSegment = {
        type: OB11MessageDataType.Forward,
        data: {
          id: message.msgId
        }
      }
    } else if (element.inlineKeyboardElement) {
      messageSegment = {
        type: OB11MessageDataType.Keyboard,
        data: {
          rows: element.inlineKeyboardElement.rows.map(row => ({
            buttons: row.buttons.map(button => ({
              id: button.id,
              render_data: {
                label: button.label,
                visited_label: button.visitedLabel,
                style: button.style,
              },
              action: {
                type: button.type,
                permission: {
                  type: button.permissionType,
                  specify_role_ids: button.specifyRoleIds,
                  specify_user_ids: button.specifyTinyids,
                },
                unsupport_tips: button.unsupportTips,
                data: button.data,
                reply: button.isReply,
                enter: button.enter,
              },
            }))
          }))
        }
      }
    }
    if (messageSegment) {
      segments.push(messageSegment)
      cqCode += encodeCQCode(messageSegment)
    }
  }

  return { segments, cqCode }
}
