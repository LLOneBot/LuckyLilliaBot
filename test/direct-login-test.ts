/**
 * Test script: try connecting to QQ server and fetch QR code
 * Run: npx tsx test/direct-login-test.ts
 */

import { DirectProtocolClient, fetchQrCode, pollQrCode, loginWithQrResult, QrCodeState } from '../src/main/qqProtocol/direct'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  console.log('=== Direct QQ Protocol Login Test ===\n')

  const client = new DirectProtocolClient()

  client.on('error', (err) => {
    console.error('[Error]', err.message)
  })

  client.on('close', () => {
    console.log('[Connection closed]')
  })

  // Debug: log raw data received
  ;(client as any).conn.on('rawdata', (chunk: Buffer) => {
    console.log(`[Raw data received] ${chunk.length} bytes, first 32:`, chunk.subarray(0, 32).toString('hex'))
  })

  ;(client as any).conn.on('packet', (frame: Buffer) => {
    console.log(`[Frame received] ${frame.length} bytes, first 32:`, frame.subarray(0, 32).toString('hex'))
  })

  ;(client as any).conn.on('send', (data: Buffer) => {
    console.log(`[Sent] ${data.length} bytes, first 32:`, data.subarray(0, 32).toString('hex'))
  })

  // Step 1: Connect to QQ server
  console.log('Connecting to msfwifi.3g.qq.com:8080...')
  try {
    await client.connect()
    console.log('Connected!\n')
  } catch (err) {
    console.error('Connection failed:', (err as Error).message)
    process.exit(1)
  }

  // Step 2: Fetch QR code
  console.log('Fetching QR code (timeout 15s)...')
  console.log('Using Lagrange plaintext for debugging...')

  // Use Lagrange's exact Code2D plaintext to verify our frame/encryption is correct
  const { EncryptType, buildServicePacket } = await import('../src/main/qqProtocol/direct/packet')
  const { teaEncrypt } = await import('../src/main/qqProtocol/direct/tea')

  // Lagrange's Code2D plaintext (270 bytes, from debug capture)
  const lagrangePlaintext = Buffer.from('0001005F5E164F000000720000006A096F670200FC0031000000000000000000000000000000000000000000030000003200000000000000000000000000005F5E164F0000000000000000000000000700160043000000005F5E164F20073F63CE8B84DCB46F6853717E3503978E04F2000E636F6D2E74656E63656E742E71710005322E302E30000E636F6D2E74656E63656E742E7171001B001E000000000000000000000003000000040000004800000002000000020000001D000A0100007FFC000000000000330010CE8B84DCB46F6853717E3503978E04F20035000400000013006600040000001300D1001E0A180A054C696E7578120F4C616772616E67652D3842394430462202300103', 'hex')

  // Build WtLogin frame with this plaintext (encrypted with our ECDH key)
  const shareKey = client.getEcdhShareKey()
  const pubKey = client.getEcdhPublicKey()
  const { randomBytes: rb } = await import('node:crypto')
  const randomKey = rb(16)

  // TEA encrypt plaintext with our ECDH shared key
  const cipher = Buffer.from(teaEncrypt(lagrangePlaintext, shareKey))

  // Build encrypt head
  const encHead = Buffer.alloc(2 + 16 + 2 + 2 + pubKey.length)
  encHead.writeUInt8(1, 0)
  encHead.writeUInt8(1, 1)
  randomKey.copy(encHead, 2)
  encHead.writeUInt16BE(0x0102, 18)
  encHead.writeUInt16BE(pubKey.length, 20)
  pubKey.copy(encHead, 22)

  // Build WtLogin inner
  const inner = Buffer.alloc(2 + 2 + 2 + 4 + 1 + 1 + 4 + 1 + 2 + 2 + 4 + encHead.length + cipher.length)
  let off = 0
  inner.writeUInt16BE(8001, off); off += 2
  inner.writeInt16BE(0x0812, off); off += 2
  inner.writeUInt16BE(0, off); off += 2
  inner.writeUInt32BE(0, off); off += 4
  inner.writeUInt8(3, off); off += 1
  inner.writeUInt8(0x87, off); off += 1
  inner.writeInt32BE(0, off); off += 4
  inner.writeUInt8(2, off); off += 1
  inner.writeInt16BE(0, off); off += 2
  inner.writeInt16BE(0, off); off += 2
  inner.writeInt32BE(0, off); off += 4
  encHead.copy(inner, off); off += encHead.length
  cipher.copy(inner, off)

  // Wrap in 0x02...0x03
  const frameLength = inner.length + 3
  const wtLoginFrame = Buffer.alloc(1 + 2 + inner.length + 1)
  wtLoginFrame.writeUInt8(0x02, 0)
  wtLoginFrame.writeUInt16BE(frameLength, 1)
  inner.copy(wtLoginFrame, 3)
  wtLoginFrame.writeUInt8(0x03, wtLoginFrame.length - 1)

  // Send via SSO
  try {
    const resp = await client.sendCommand('wtlogin.trans_emp', wtLoginFrame, EncryptType.EncryptEmpty, 10000)
    console.log('GOT RESPONSE!', resp.cmd, resp.payload.length, 'bytes')
    console.log('Payload hex:', resp.payload.subarray(0, 50).toString('hex'))
  } catch (err) {
    console.error('Still failed:', (err as Error).message)
  }

  await sleep(3000)
  client.disconnect()
  process.exit(0)
}

function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }
main().catch(console.error)
