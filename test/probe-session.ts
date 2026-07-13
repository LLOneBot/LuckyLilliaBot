import { DirectProtocolClient, registerOnline, persistedToSessionInfo } from '../src/main/qqProtocol/direct-lib'
import type { PersistedSession } from '../src/main/qqProtocol/direct-lib'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  const SESSION_PATH = join(import.meta.dirname, '../data/qq-session.json')
  let persisted: PersistedSession | null = null
  if (existsSync(SESSION_PATH)) {
    try { persisted = JSON.parse(readFileSync(SESSION_PATH, 'utf-8')) as PersistedSession } catch {}
  }
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
