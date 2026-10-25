import { describe, expect, it } from 'vitest'
import { otherSettings } from '@/webui/FE/components/config/otherSettings'
import { defaultConfig } from '@/main/config/defaultConfig'
import { Config } from '@/common/types'

const config: Config = {
  ...structuredClone(defaultConfig),
  webui: { enable: true, host: '', port: 3999 },
  log: false,
  satori: { enable: true, host: '0.0.0.0', port: 5600, token: 'stale-copy' },
}

describe('otherSettings', () => {
  it('saves only the keys the other-settings page edits', () => {
    const sections = otherSettings(config, [])
    expect(Object.keys(sections).sort()).toEqual([
      'log', 'msgCacheExpire', 'musicCardSignUrl', 'webui',
    ])
    // the adapter sections stay out, so a stale copy here cannot overwrite a newer save elsewhere
    expect(sections).not.toHaveProperty('satori')
    expect(sections).not.toHaveProperty('ob11')
    expect(sections.webui).toEqual({ enable: true, host: '', port: 3999 })
  })

  it('leaves out the fields an environment variable pins', () => {
    const sections = otherSettings(config, [{ path: 'webui.port', env: 'LLBOT_WEBUI_PORT' }])
    expect(sections.webui).toEqual({ enable: true, host: '' })
  })

  it('does not touch the config it was given', () => {
    otherSettings(config, [{ path: 'webui.port', env: 'LLBOT_WEBUI_PORT' }])
    expect(config.webui.port).toBe(3999)
  })
})
