/** Public projection of a QR setup session. Keys and credentials stay in the backend. */
export interface QQSetupState {
  id: string
  phase: 'starting' | 'waiting' | 'saving' | 'complete' | 'failed' | 'cancelled' | 'expired'
  url?: string
  qrCode?: string
  appId?: string
  message?: string
}
