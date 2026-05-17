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
  console.log('Fetching QR code...')
  let qrResult
  try {
    qrResult = await fetchQrCode(client)
    console.log('QR URL:', qrResult.url || '(unable to extract URL)')
    console.log('QR Sig length:', qrResult.sig.length, 'bytes')
    console.log('QR Image length:', qrResult.image.length, 'bytes')

    if (qrResult.image.length > 0) {
      const imgPath = join(import.meta.dirname, 'qr-code.png')
      writeFileSync(imgPath, qrResult.image)
      console.log(`QR image saved to: ${imgPath}`)
    }
    console.log()
  } catch (err) {
    console.error('Fetch QR failed:', (err as Error).message)
    console.error('Stack:', (err as Error).stack)
    client.disconnect()
    process.exit(1)
  }

  if (!qrResult.sig.length) {
    console.error('No QR sig received, cannot poll')
    client.disconnect()
    process.exit(1)
  }

  // Step 3: Poll QR code status
  console.log('Polling QR code status (scan the QR code with your phone)...')
  console.log('Press Ctrl+C to cancel\n')

  let pollResult
  while (true) {
    try {
      pollResult = await pollQrCode(client, qrResult.sig)
    } catch (err) {
      console.error('Poll error:', (err as Error).message)
      await sleep(3000)
      continue
    }

    switch (pollResult.state) {
      case QrCodeState.WaitingForScan:
        process.stdout.write('.')
        break
      case QrCodeState.WaitingForConfirm:
        console.log('\n[Scanned] Waiting for confirmation...')
        break
      case QrCodeState.Confirmed:
        console.log('\n[Confirmed!]')
        console.log('UIN:', pollResult.uin)
        console.log('TgtgtKey length:', pollResult.tgtgtKey?.length || 0)
        console.log('NoPicSig length:', pollResult.noPicSig?.length || 0)
        console.log('TempPassword length:', pollResult.tempPassword?.length || 0)
        break
      case QrCodeState.Expired:
        console.log('\n[QR code expired]')
        client.disconnect()
        process.exit(1)
      case QrCodeState.Cancelled:
        console.log('\n[Cancelled by user]')
        client.disconnect()
        process.exit(1)
      default:
        console.log(`\n[Unknown state: ${pollResult.state}]`)
    }

    if (pollResult.state === QrCodeState.Confirmed) break
    await sleep(2000)
  }

  // Step 4: Complete login
  console.log('\nCompleting login with wtlogin.login...')
  try {
    await loginWithQrResult(client, pollResult)
    console.log('\nLogin successful!')
    console.log('Session established.')
  } catch (err) {
    console.error('Login failed:', (err as Error).message)
    console.error('Stack:', (err as Error).stack)
  }

  client.disconnect()
  console.log('\nDone.')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(console.error)
