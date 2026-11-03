import { describe, expect, it } from 'vitest'
import { lockedBy, webuiPatch } from '@/plugin/internal/service/webui/FE/components/config/webuiPatch'

describe('the WebUI section of the settings dialog', () => {
  it('saves where the WebUI listens', () => {
    expect(webuiPatch({ host: '', port: 3999 }, [])).toEqual({ host: '', port: 3999 })
  })

  it('leaves out what a flag or a variable pins', () => {
    expect(webuiPatch({ host: '', port: 3999 }, [{ path: 'webui.port', by: '--webui-port' }])).toEqual({ host: '' })
    expect(webuiPatch({ host: '', port: 3999 }, [{ path: 'webui.host', by: 'LLBOT_WEBUI_HOST' }])).toEqual({ port: 3999 })
  })

  it('says who pinned it', () => {
    expect(lockedBy({ path: 'webui.port', by: '--webui-port' })).toBe('由启动参数 --webui-port 指定，这里改不了')
    expect(lockedBy({ path: 'webui.port', by: 'LLBOT_WEBUI_PORT' })).toBe('由环境变量 LLBOT_WEBUI_PORT 指定，这里改不了')
  })
})
