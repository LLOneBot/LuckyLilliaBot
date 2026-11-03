import { describe, expect, it } from 'vitest'
import { detectQQPath } from '@/plugin/internal/protocol/nt-protocol/qqPath'

const only = (...files: string[]) => (file: string) => files.includes(file)

describe('the QQ NativeQQ starts without a path', () => {
  it('is next to the uninstaller the registry names, the 32-bit key first', async () => {
    const uninstallers = async () => ['"D:\\Apps\\QQNT\\Uninstall.exe"', 'C:\\Other\\Uninstall.exe']
    expect(await detectQQPath('win32', uninstallers, only('D:\\Apps\\QQNT\\QQ.exe', 'C:\\Other\\QQ.exe'))).toBe('D:\\Apps\\QQNT\\QQ.exe')
    expect(await detectQQPath('win32', uninstallers, only('C:\\Other\\QQ.exe'))).toBe('C:\\Other\\QQ.exe')
  })

  it('is in a usual place when the registry has none', async () => {
    const none = async () => []
    expect(await detectQQPath('win32', none, only('C:\\Program Files (x86)\\Tencent\\QQNT\\QQ.exe'))).toBe('C:\\Program Files (x86)\\Tencent\\QQNT\\QQ.exe')
    expect(await detectQQPath('win32', none, only())).toBeUndefined()
  })

  it('is at the one fixed path on Linux and macOS', async () => {
    const none = async () => []
    expect(await detectQQPath('linux', none, only('/opt/QQ/qq'))).toBe('/opt/QQ/qq')
    expect(await detectQQPath('darwin', none, only('/Applications/QQ.app/Contents/MacOS/QQ'))).toBe('/Applications/QQ.app/Contents/MacOS/QQ')
    expect(await detectQQPath('linux', none, only())).toBeUndefined()
    expect(await detectQQPath('freebsd', none, only('/opt/QQ/qq'))).toBeUndefined()
  })
})
