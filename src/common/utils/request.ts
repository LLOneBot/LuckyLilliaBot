import https from 'node:https'
import http from 'node:http'
import { Dict } from 'cosmokit'

const HTTPS_PROTOCOL = 'https'
const REDIRECT_CODES = new Set([301, 302])
const SUCCESS_STATUS_RANGE = { min: 200, max: 299 }
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QQ/9.9.23-41857 Chrome/138.0.7204.35 Electron/37.1.0 Safari/537.36 OS/win32,x64,10.0.26100,Windows Internet Explorer/11'

export class HttpUtil {
  static async getCookies(url: string): Promise<{ [key: string]: string }> {
    const client = url.startsWith(HTTPS_PROTOCOL) ? https : http
    return new Promise((resolve, reject) => {
      client.get(url, (res) => {
        let cookies: { [key: string]: string } = {}
        const handleRedirect = (res: http.IncomingMessage) => {
          if (res.statusCode && REDIRECT_CODES.has(res.statusCode)) {
            if (res.headers.location) {
              const redirectUrl = new URL(res.headers.location, url)
              HttpUtil.getCookies(redirectUrl.href).then((redirectCookies) => {
                // 合并重定向过程中的cookies
                cookies = { ...cookies, ...redirectCookies }
                resolve(cookies)
              }).catch(reject)
            } else {
              resolve(cookies)
            }
          } else {
            resolve(cookies)
          }
        }
        res.on('data', () => { }) // Necessary to consume the stream
        res.on('end', () => {
          handleRedirect(res)
        })
        if (res.headers['set-cookie']) {
          res.headers['set-cookie'].forEach((cookie) => {
            const [keyValue] = cookie.split(';')
            const [key, value] = keyValue.split('=')
            if (key?.trim() && value?.trim()) {
              cookies[key.trim()] = value.trim()
            }
          })
        }
      }).on('error', (err) => {
        reject(err)
      })
    })
  }

  static async getJson<T>(
    url: string,
    method: string = 'GET',
    data?: unknown,
    headers: Record<string, string> = {},
    isJsonRet: boolean = true,
    isArgJson: boolean = true
  ): Promise<T> {
    const option = new URL(url)
    const protocol = url.startsWith('https://') ? https : http
    const options = {
      hostname: option.hostname,
      port: option.port,
      path: option.href,
      method: method,
      headers: headers
    }
    return new Promise((resolve, reject) => {
      const req = protocol.request(options, (res: Dict) => {
        let responseBody = ''
        res.on('data', (chunk: string | Buffer) => {
          responseBody += chunk.toString()
        })

        res.on('end', () => {
          try {
            const statusCode = res.statusCode
            if (statusCode && statusCode >= SUCCESS_STATUS_RANGE.min && statusCode <= SUCCESS_STATUS_RANGE.max) {
              if (isJsonRet) {
                const responseJson = JSON.parse(responseBody)
                resolve(responseJson as T)
              } else {
                resolve(responseBody as T)
              }
            } else {
              reject(new Error(`Unexpected status code: ${statusCode}`))
            }
          } catch (parseError) {
            reject(parseError)
          }
        })
      })

      req.on('error', (error) => {
        reject(error)
      })
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        if (isArgJson) {
          req.write(JSON.stringify(data))
        } else {
          req.write(data)
        }
      }
      req.end()
    })
  }

  static async getText(url: string, method: string = 'GET', data?: unknown, headers: Record<string, string> = {}) {
    return this.getJson<string>(url, method, data, headers, false, false)
  }

  static async post(url: string, data: Dict = {}, cookies: string = '', headers: Record<string, string> = {}) {
    const urlObj = new URL(url)
    const protocol = urlObj.protocol === 'https:' ? 'https://' : 'http://'
    const origin = protocol + urlObj.hostname
    
    const _headers = {
      'User-Agent': DEFAULT_USER_AGENT,
      'Cookie': cookies,
      'Content-Type': 'application/json',
      'origin': origin,
      ...headers,
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: _headers,
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} statusText: ${response.statusText}`)
    }
    return response
  }
}
