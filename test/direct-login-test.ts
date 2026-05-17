import { DirectProtocolClient, fetchQrCode, pollQrCode, QrCodeState } from '../src/main/qqProtocol/direct'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  console.log('=== Direct QQ Protocol Login Test ===\n')

  const client = new DirectProtocolClient({ signUrl: 'http://127.0.0.1:8080' })
  client.on('error', (err: Error) => console.error('[Error]', err.message))
  client.on('close', () => console.log('[Disconnected]'))

  await client.connect()
  console.log('Connected!\n')

  // Fetch QR code
  console.log('Fetching QR code...')
  const qr = await fetchQrCode(client)
  console.log('QR URL:', qr.url)
  console.log('QR Sig:', qr.sig.length, 'bytes')
  if (qr.image.length > 0) {
    writeFileSync(join(import.meta.dirname, 'qr-code.png'), qr.image)
    console.log('QR image saved.\n')
  }

  // Poll
  console.log('Polling... scan the QR code with your phone!')
  while (true) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      const result = await pollQrCode(client, qr.sig)
      switch (result.state) {
        case QrCodeState.WaitingForScan:
          process.stdout.write('.')
          break
        case QrCodeState.WaitingForConfirm:
          console.log('\n[Scanned] Waiting for confirm...')
          break
        case QrCodeState.Confirmed:
          console.log('\n[Confirmed!]')
          console.log('TgtgtKey:', result.tgtgtKey?.length, 'bytes')
          console.log('NoPicSig:', result.noPicSig?.length, 'bytes')
          console.log('TempPassword:', result.tempPassword?.length, 'bytes')
          client.disconnect()
          return
        case QrCodeState.Expired:
          console.log('\n[Expired]')
          client.disconnect()
          return
        case QrCodeState.Cancelled:
          console.log('\n[Cancelled]')
          client.disconnect()
          return
        default:
          console.log(`\n[Unknown state: ${result.state}]`)
      }
    } catch (e) {
      console.error('\nPoll error:', (e as Error).message)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
