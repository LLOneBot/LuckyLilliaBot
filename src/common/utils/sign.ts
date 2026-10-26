import { ElementType, SendMessageElement } from '@/ntqqapi/types'

/** Our card sign service (docs/card-message-sign.md). Empty until it is deployed: cards then go out as they are. */
export const CARD_SIGN_URL: string = ''

/** The server's signature on a card (ark). Without it a card shows on PC but not on phones. */
export function hasCardToken(json: string): boolean {
  try {
    return !!JSON.parse(json)?.config?.token
  } catch {
    return false
  }
}

/** Posts the card JSON as is and gets the signed card back (docs/card-message-sign.md). */
export async function signCard(url: string, json: string): Promise<string> {
  if (hasCardToken(json)) return json
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    signal: AbortSignal.timeout(15_000),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`卡片消息签名失败：${text || `HTTP ${resp.status}`}`)
  if (!hasCardToken(text)) throw new Error('卡片消息签名失败：签名服务返回的卡片没有 token')
  return text
}

/** Signs every card in a message, the ones inside a merged forward included. */
export async function signCards(elements: SendMessageElement[], sign: (json: string) => Promise<string>): Promise<void> {
  for (const element of elements) {
    if (element.elementType === ElementType.Ark && element.arkElement.bytesData) {
      element.arkElement.bytesData = await sign(element.arkElement.bytesData)
    } else if (element.elementType === ElementType.MultiForward) {
      for (const node of element.multiForwardMsgElement.nodes ?? []) await signCards(node.elements, sign)
    }
  }
}
