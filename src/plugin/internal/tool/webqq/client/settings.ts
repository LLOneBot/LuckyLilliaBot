import { usePluginConfig } from '@luckylillia/plugin-sdk/webui'

/** Mirrors ../settings.ts, which the WebUI cannot import: it pulls in the host */
interface WebQQSettings {
  autoHideSidebar: boolean
  fullscreenButton: boolean
}

/** WebQQ's settings from its config dialog; the defaults while they load. */
export function useWebQQSettings(): WebQQSettings {
  const { value } = usePluginConfig<WebQQSettings>()
  return { autoHideSidebar: value?.autoHideSidebar ?? false, fullscreenButton: value?.fullscreenButton ?? true }
}
