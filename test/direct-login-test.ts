import { DirectProtocolClient, fetchQrCode, pollQrCode, loginWithQrResult, registerOnline, sendHeartbeat, startHeartbeat, getCorrectUin, QrCodeState, AppInfo, saveSession, loadSession, persistedToSessionInfo } from '../src/main/qqProtocol/direct'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SESSION_PATH = join(import.meta.dirname, 'qq-session.json')

async function main() {
  console.log('=== Direct QQ Protocol Login Test ===\n')

  const client = new DirectProtocolClient({ signUrl: 'http://127.0.0.1:8080' })
  client.on('error', (err: Error) => console.error('[Error]', err.message))
  client.on('close', () => console.log('[Disconnected]'))

  // Try to restore session
  const persisted = loadSession(SESSION_PATH)
  if (persisted) {
    console.log(`Found saved session for UIN ${persisted.uin}, attempting restore...`)
    client.setGuid(Buffer.from(persisted.guid, 'hex'))
    await client.connect()

    const session = persistedToSessionInfo(persisted)
    client.setSession(session)

    // Try register to check if session is still valid
    try {
      await registerOnline(client)
      console.log('Session restored successfully!\n')
      await runOnline(client)
      return
    } catch (e) {
      console.log('Session expired, re-login required:', (e as Error).message)
      client.disconnect()
      // Fall through to QR login
    }
  }

  // Fresh QR login
  await client.connect()
  console.log('Connected!\n')

  const qr = await fetchQrCode(client)
  console.log('QR URL:', qr.url)
  if (qr.image.length > 0) {
    writeFileSync(join(import.meta.dirname, 'qr-code.png'), qr.image)
    console.log('QR image saved.\n')
  }

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
  const urlParams = new URL(qr.url).searchParams
  const qrSig = urlParams.get('k') || ''
  let uin: number
  try {
    uin = await getCorrectUin(AppInfo.appId, qrSig)
    console.log('UIN:', uin)
  } catch (e) {
    console.error('Get UIN failed:', (e as Error).message)
    client.disconnect()
    return
  }

  pollResult.uin = String(uin)

  // wtlogin.login
  console.log('\nPerforming wtlogin.login...')
  const loginResult = await loginWithQrResult(client, pollResult)
  if (!loginResult.success) {
    console.log('Login failed! State:', loginResult.state, loginResult.tag, loginResult.message)
    client.disconnect()
    return
  }
  console.log('Login successful! UID:', loginResult.uid)

  // Save session for next time
  const session = client.getSession()!
  saveSession(session, pollResult.tgtgtKey!, client.getGuid(), loginResult.tempPassword, SESSION_PATH)

  // Register + go online
  await registerOnline(client)
  await runOnline(client)
}

async function runOnline(client: DirectProtocolClient) {
  // Heartbeat
  try {
    await sendHeartbeat(client)
    console.log('Heartbeat OK')
  } catch (e) {
    console.error('Heartbeat failed:', (e as Error).message)
  }

  const stopHeartbeat = startHeartbeat(client)
  console.log('\nOnline! Listening for 30 seconds...')

  client.on('push', (packet: { cmd: string; payload: Buffer }) => {
    console.log(`[Push] cmd=${packet.cmd} len=${packet.payload.length}`)
  })

  await new Promise(r => setTimeout(r, 30000))

  stopHeartbeat()
  client.disconnect()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
