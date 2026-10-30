// 由 authTokenWatcher 维护, 经 /api/auth-token/status 给前端
export interface AuthTokenStatus {
  hasToken: boolean
  validation: 'idle' | 'validating' | 'valid' | 'invalid' | 'error'
  // validation 为 invalid/error 时的说明
  message: string
  // 登录/sign 阶段的错误 (如 auth_token 可用 QQ 数量已达上限); '' 表示无
  loginError: string
}

// One per process, like the DirectProtocolClient whose sign the token is for (direct.ts): the native sign relay
// cannot be bound a second time
export const authTokenStatus: AuthTokenStatus = {
  hasToken: false,
  validation: 'idle',
  message: '',
  loginError: '',
}
