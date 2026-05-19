import { DirectProtocolClient, registerOnline, loadSession, persistedToSessionInfo } from '../src/main/qqProtocol/direct'
import { join } from 'node:path'

async function main() {
  const SESSION_PATH = join(import.meta.dirname, '../data/qq-session.json')
  const persisted = loadSession(SESSION_PATH)
  if (!persisted) {
    console.log('NO_SESSION')
    process.exit(2)
  }
  console.log(`SESSION_FOUND uin=${persisted.uin}`)

  const client = new DirectProtocolClient({ signUrl: 'http://127.0.0.1:8080' })
  client.on('error', (err: Error) => console.error('[Error]', err.message))

  client.setGuid(Buffer.from(persisted.guid, 'hex'))
  await client.connect()
  console.log('CONNECTED')

  client.setSession(persistedToSessionInfo(persisted))

  try {
    await registerOnline(client)
    console.log('REGISTER_OK')
  } catch (e) {
    console.log('REGISTER_FAIL:', (e as Error).message)
    client.disconnect()
    process.exit(3)
  }

  client.disconnect()
  process.exit(0)
}
main().catch(e => { console.error('FATAL:', e); process.exit(1) })
