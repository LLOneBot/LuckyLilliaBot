import { DirectProtocolClient, fetchQrCode, pollQrCode, QrCodeState } from '../src/main/qqProtocol/direct'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  console.log('=== Direct QQ Protocol Login Test (with Sign) ===\n')

  const client = new DirectProtocolClient({
    signUrl: 'http://0.0.0.0:8080',
  })

  client.on('error', (err: Error) => console.error('[Error]', err.message))
  client.on('close', () => console.log('[Connection closed]'))

  console.log('Connecting to msfwifi.3g.qq.com:8080...')
  await client.connect()
  console.log('Connected!\n')

  console.log('Fetching QR code (with signing)...')
  try {
    const qrResult = await fetchQrCode(client)
    console.log('SUCCESS!')
    console.log('QR URL:', qrResult.url || '(parsing needed)')
    console.log('QR Image:', qrResult.image.length, 'bytes')
    console.log('QR Sig:', qrResult.sig.length, 'bytes')

    if (qrResult.image.length > 0) {
      const imgPath = join(import.meta.dirname, 'qr-code.png')
      writeFileSync(imgPath, qrResult.image)
      console.log('QR image saved to:', imgPath)
    }
  } catch (err) {
    console.error('Failed:', (err as Error).message)
  }

  await new Promise(r => setTimeout(r, 2000))
  client.disconnect()
}

main().catch(console.error)
