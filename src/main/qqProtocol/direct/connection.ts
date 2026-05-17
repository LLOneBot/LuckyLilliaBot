/**
 * TCP connection manager for direct QQ protocol
 * Connects to msfwifi.3g.qq.com:8080, handles frame reading
 */

import { Socket } from 'node:net'
import { lookup } from 'node:dns/promises'
import { EventEmitter } from 'node:events'

export interface ConnectionOptions {
  useIPv6?: boolean
}

export class TcpConnection extends EventEmitter {
  private socket: Socket | null = null
  private buffer: Buffer = Buffer.alloc(0)
  private connected = false

  async connect(options: ConnectionOptions = {}): Promise<void> {
    const host = options.useIPv6 ? 'msfwifiv6.3g.qq.com' : 'msfwifi.3g.qq.com'
    const port = options.useIPv6 ? 14000 : 8080

    const addresses = await lookup(host, { all: true, family: options.useIPv6 ? 6 : 4 })
    if (addresses.length === 0) {
      throw new Error(`DNS resolution failed for ${host}`)
    }

    const addr = addresses[0]

    return new Promise((resolve, reject) => {
      this.socket = new Socket()
      this.socket.setKeepAlive(true, 30000)

      this.socket.on('connect', () => {
        this.connected = true
        this.emit('connected')
        resolve()
      })

      this.socket.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        this.processFrames()
      })

      this.socket.on('error', (err) => {
        this.emit('error', err)
        if (!this.connected) reject(err)
      })

      this.socket.on('close', () => {
        this.connected = false
        this.emit('close')
      })

      this.socket.connect(port, addr.address)
    })
  }

  private processFrames(): void {
    while (this.buffer.length >= 4) {
      const frameLen = this.buffer.readUInt32BE(0)
      if (frameLen > 64 * 1024 * 1024) {
        this.emit('error', new Error(`Frame too large: ${frameLen}`))
        this.disconnect()
        return
      }
      if (this.buffer.length < frameLen) break

      const frame = this.buffer.subarray(4, frameLen)
      this.buffer = this.buffer.subarray(frameLen)
      this.emit('packet', Buffer.from(frame))
    }
  }

  send(data: Buffer): void {
    if (!this.socket || !this.connected) {
      throw new Error('Not connected')
    }
    this.socket.write(data)
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.connected = false
  }

  get isConnected(): boolean {
    return this.connected
  }
}
