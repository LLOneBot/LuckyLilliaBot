import https from 'node:https'
import http from 'node:http'
import { Dict } from 'cosmokit'

export class HttpUtil {
  static async getCookies(url: string): Promise<{ [key: string]: string }> {
    const client = url.startsWith('https') ? https : http
    return new Promise((resolve, reject) => {
      client.get(url, (res) => {
        let cookies: { [key: string]: string } = {}
        const handleRedirect = (res: http.IncomingMessage) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            if (res.headers.location) {
              const redirectUrl = new URL(res.headers.location, url)
              HttpUtil.getCookies(redirectUrl.href).then((redirectCookies) => {
                // 合并重定向过程中的cookies
                //log('redirectCookies', redirectCookies)
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
          //log('set-cookie', url, res.headers['set-cookie'])
          res.headers['set-cookie'].forEach((cookie) => {
            const parts = cookie.split(';')[0].split('=')
            const key = parts[0]
            const value = parts[1]
            if (key && value && key.length > 0 && value.length > 0) {
              cookies[key] = value
            }
          })
        }
      }).on('error', (err) => {
        reject(err)
      })
    })
  }

  static async getJson<T>(url: string, method: string = 'GET', data?: unknown, headers: Record<string, string> = {}, isJsonRet: boolean = true, isArgJson: boolean = true): Promise<T> {
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
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              if (isJsonRet) {
                const responseJson = JSON.parse(responseBody)
                resolve(responseJson as T)
              } else {
                resolve(responseBody as T)
              }
            } else {
              reject(new Error(`Unexpected status code: ${res.statusCode}`))
            }
          } catch (parseError) {
            reject(parseError)
          }
        })
      })

      req.on('error', (error) => {
        reject(error)
      })
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
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
    const _headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QQ/9.9.23-41857 Chrome/138.0.7204.35 Electron/37.1.0 Safari/537.36 OS/win32,x64,10.0.26100,Windows 11 Pro QQAppId/537320161',
      'Cookie': cookies,
      'Content-Type': 'application/json',
      'origin': url.startsWith('https') ? 'https://' + new URL(url).hostname : 'http://' + new URL(url).hostname,
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
