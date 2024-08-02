import { Level } from 'level'

const db = new Level(process.env['level_db_path'] as string, { valueEncoding: 'json' })

async function getGroupNotify() {
  let keys = await db.keys().all()
  let result: string[] = []
  for (const key of keys) {
    // console.log(key)
    if (key.startsWith('group_notify_')) {
      result.push(key)
    }
  }
  return result
}

getGroupNotify().then(console.log)
