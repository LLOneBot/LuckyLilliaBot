/** Current identity and message activity since the official bot plugin started. Times are Unix milliseconds. */
export interface QQOfficialStats {
  appId: string
  name?: string
  avatar?: string
  status: number
  configured: boolean
  sandbox: boolean
  messageReceived: number
  messageSent: number
  startedAt: number
  lastMessageAt?: number
}
