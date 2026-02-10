import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { ChatType, ElementType, RawMessage } from '@/ntqqapi/types'

export async function logSummaryMessage(ctx: Context, message: RawMessage) {
  const direction = message.senderUid == selfInfo.uid ? '发' : '收'
  let sender = message.sendMemberName || message.sendRemarkName || message.sendNickName
  const senderUin = message.senderUin
  let summary = ''
  for (const msgEle of message.elements) {
    switch (msgEle.elementType) {
      case ElementType.Text: {
        // if (msgEle.textElement?.atType === AtType.All) {
        //   summary += `@全体成员 `
        // }
        // else if (msgEle.textElement?.atType == AtType.One) {
        //   summary += `@${msgEle.textElement.atUid} `
        // }
        summary += `${msgEle.textElement?.content}`
      }
        break
      case ElementType.Pic: {
        summary += `[图片]${msgEle.picElement?.fileName}`
      }
        break
      case ElementType.Face: {
        summary += `[表情]${msgEle.faceElement?.faceText || '未知表情'}`
      }
        break
      case ElementType.Ptt: {
        summary += `[语音](${msgEle.pttElement?.fileName})`
      }
        break
      case ElementType.Video: {
        summary += `[视频]${msgEle.videoElement?.fileName}`
      }
        break
      case ElementType.File: {
        summary += `[文件]${msgEle.fileElement?.fileName}`
      }
        break
      case ElementType.Ark: {
        summary += `[卡片]`
      }
        break
      case ElementType.MultiForward: {
        summary += `[合并转发]`
      }
    }
  }
  if (!summary){
    return
  }
  let peerName = ''
  if (message.chatType == ChatType.Group) {
    peerName = `群] ${message.peerName}(${message.peerUid}) ${sender}(${senderUin})`
  }
  else if (message.chatType == ChatType.C2C) {
    try {
      const userUid = message.peerUid
      const userInfo = (await ctx.ntUserApi.getUserDetailInfoWithBizInfo(userUid)).simpleInfo.coreInfo
      sender = userInfo.remark || userInfo.nick
      peerName = `私] ${sender}(${userInfo.uin})`
    }catch (e) {
      return
    }
  }
  else if (message.chatType == ChatType.TempC2CFromGroup) {
    peerName = `临] ${message.peerName}(${message.peerUin})`
  }
  const logMsg = `[${direction}-${peerName}：\n${summary}`
  ctx.logger.info(logMsg)
}
