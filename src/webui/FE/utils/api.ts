import { ElMessage } from 'element-plus'

// Token管理
const tokenKey = 'webui_token'

export function getToken(): string {
  return localStorage.getItem(tokenKey) || ''
}

export function setTokenStorage(token: string): void {
  localStorage.setItem(tokenKey, token)
}

export function removeToken(): void {
  localStorage.removeItem(tokenKey)
}

// 设置token到后端
async function setTokenToBackend(newToken: string): Promise<void> {
  const resp = await fetch('/api/set-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: newToken }),
  })
  const data = await resp.json()
  if (!data.success) {
    throw new Error(data.message || '设置密码失败')
  }
}

// 弹出密码输入框
let showPasswordDialog: ((tip: string) => Promise<string>) | null = null

export function setPasswordPromptHandler(handler: (tip: string) => Promise<string>): void {
  showPasswordDialog = handler
}

async function promptPassword(tip: string): Promise<string> {
  console.log('调用promptPassword，tip:', tip)
  if (!showPasswordDialog) {
    console.error('密码输入处理器未设置!')
    throw new Error('密码输入处理器未设置')
  }
  console.log('开始调用密码输入对话框')
  const result = await showPasswordDialog(tip)
  // 判断是否有中文
  if (/[^\x00-\x7F]/.test(result)) {
    ElMessage.warning('密码不能包含中文')
    return await promptPassword(tip)
  }
  console.log('密码输入完成，结果长度:', result.length)
  return result
}

// 封装的API请求函数
export async function apiFetch(url: string, options: any = {}, port?: number): Promise<Response> {
  console.log('apiFetch 调用:', url, '，当前有token:', !!getToken())
  options.headers = options.headers || {}
  let token = getToken()

  if (token) {
    options.headers['x-webui-token'] = token
  }
  if (port){
    url = `${window.location.protocol}//${window.location.hostname}:${port}` + url
  }
  let resp = await fetch(url, options)
  console.log('API请求返回状态:', resp.status, 'URL:', url)

  // 如果不是401/403，直接返回
  if (resp.status !== 401 && resp.status !== 403) {
    return resp
  }

  while (resp.status === 401 || resp.status === 403) {
    if (resp.status === 401) {
      removeToken()
      const inputPwd = await promptPassword('请设置密码')
      // 401时需要setToken
      try {
        await setTokenToBackend(inputPwd)
        setTokenStorage(inputPwd)
        token = inputPwd
        ElMessage.success('密码设置成功')
      } catch (e: any) {
        ElMessage.error(e.message || '设置密码失败')
        throw new Error('设置密码失败')
      }
    } else if (resp.status === 403) {
      removeToken()
      const inputPwd = await promptPassword('密码校验失败，请输入密码')
      // 403时只保存本地密码，不调用setToken
      setTokenStorage(inputPwd)
      token = inputPwd
    }

    // 重新带新密码请求
    options.headers['x-webui-token'] = token
    resp = await fetch(url, options)

    if (resp.status !== 401 && resp.status !== 403) {
      return resp
    }
  }

  return resp
}

// 便捷的API调用方法
export async function apiGet(url: string, port?: number): Promise<any> {
  const resp = await apiFetch(url, {}, port)
  return resp.json()
}

export async function apiPost(url: string, data: any, port?: number): Promise<any> {
  const resp = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, port)
  return resp.json()
}
