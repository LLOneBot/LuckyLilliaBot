import { DirectProtocolClient, fetchQrCode, pollQrCode, getCorrectUin, QrCodeState, AppInfo } from '../src/main/qqProtocol/direct'
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
  const qr = await fetchQrCode(client)
  console.log('QR URL:', qr.url)
  if (qr.image.length > 0) {
    writeFileSync(join(import.meta.dirname, 'qr-code.png'), qr.image)
    console.log('QR image saved.\n')
  }

  // Poll
  console.log('Scan the QR code with your phone...')
  let pollResult
  while (true) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      pollResult = await pollQrCode(client, qr.sig)
    } catch (e) {
      console.error('Poll error:', (e as Error).message)
      continue
    }

    switch (pollResult.state) {
      case QrCodeState.WaitingForScan:
        process.stdout.write('.')
        break
      case QrCodeState.WaitingForConfirm:
        console.log('\n[Scanned!] Confirm on phone...')
        break
      case QrCodeState.Confirmed:
        console.log('\n[Confirmed!]')
        console.log('  TgtgtKey:', pollResult.tgtgtKey?.length, 'bytes')
        console.log('  NoPicSig:', pollResult.noPicSig?.length, 'bytes')
        console.log('  TempPassword:', pollResult.tempPassword?.length, 'bytes')
        break
      case QrCodeState.Expired:
        console.log('\n[QR Expired]')
        client.disconnect()
        return
      case QrCodeState.Cancelled:
        console.log('\n[Cancelled]')
        client.disconnect()
        return
    }

    if (pollResult.state === QrCodeState.Confirmed) break
  }

  // Get UIN
  console.log('\nGetting UIN...')
  // Extract qrSig from URL (the 'k' param)
  const urlParams = new URL(qr.url).searchParams
  const qrSig = urlParams.get('k') || ''
  try {
    const uin = await getCorrectUin(AppInfo.appId, qrSig)
    console.log('UIN:', uin)
  } catch (e) {
    console.error('Get UIN failed:', (e as Error).message)
  }

  console.log('\nLogin flow complete (wtlogin.login not yet implemented)')
  client.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
