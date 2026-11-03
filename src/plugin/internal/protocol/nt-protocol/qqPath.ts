import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

const UNINSTALL_KEYS = [
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ',
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ',
]

const WINDOWS_PATHS = [
  'C:\\Program Files\\Tencent\\QQNT\\QQ.exe',
  'D:\\Program Files\\Tencent\\QQNT\\QQ.exe',
  'C:\\Program Files (x86)\\Tencent\\QQNT\\QQ.exe',
]

/** The keys' UninstallString values, in order. Through PowerShell for UTF-8: reg.exe prints in the console code page */
async function uninstallStrings(): Promise<string[]> {
  const keys = UNINSTALL_KEYS.map(key => `'${key}'`).join(', ')
  const script = '$OutputEncoding = [System.Text.UTF8Encoding]::new(); [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); '
    + `foreach ($key in @(${keys})) { (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).UninstallString }`
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10_000 })
    return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * The QQ that NativeQQ starts when given no path, looked for the way it does (LuckyLillia.node,
 * crates/injector/src/app.rs get_qq_path, on Windows qq.rs get_qq_path_from_registry), which it does not export:
 * on Windows next to the uninstaller the registry names, then in the usual places; elsewhere at the one fixed path.
 */
export async function detectQQPath(
  platform: NodeJS.Platform = process.platform,
  readUninstallers: () => Promise<string[]> = uninstallStrings,
  exists: (file: string) => boolean = existsSync,
): Promise<string | undefined> {
  if (platform === 'win32') {
    for (const uninstaller of await readUninstallers()) {
      const exe = path.win32.join(path.win32.dirname(uninstaller.replace(/^"(.*)"$/, '$1')), 'QQ.exe')
      if (exists(exe)) return exe
    }
    return WINDOWS_PATHS.find(file => exists(file))
  }
  const fixed = platform === 'linux' ? '/opt/QQ/qq' : platform === 'darwin' ? '/Applications/QQ.app/Contents/MacOS/QQ' : undefined
  return fixed && exists(fixed) ? fixed : undefined
}
