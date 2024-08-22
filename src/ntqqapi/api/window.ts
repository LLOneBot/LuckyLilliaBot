import { invoke, NTClass, NTMethod } from '../ntcall'
import { GeneralCallResult } from '../services'
import { ReceiveCmd } from '../hook'
import { BrowserWindow } from 'electron'

export interface NTQQWindow {
  windowName: string
  windowUrlHash: string
}

export class NTQQWindows {
  static GroupHomeWorkWindow: NTQQWindow = {
    windowName: 'GroupHomeWorkWindow',
    windowUrlHash: '#/group-home-work',
  }
  static GroupNotifyFilterWindow: NTQQWindow = {
    windowName: 'GroupNotifyFilterWindow',
    windowUrlHash: '#/group-notify-filter',
  }
  static GroupEssenceWindow: NTQQWindow = {
    windowName: 'GroupEssenceWindow',
    windowUrlHash: '#/group-essence',
  }
}

export class NTQQWindowApi {
  // 打开窗口并获取对应的下发事件
  static async openWindow<R = GeneralCallResult>(
    ntQQWindow: NTQQWindow,
    args: any[],
    cbCmd: ReceiveCmd | undefined,
    autoCloseSeconds: number = 2,
  ) {
    const result = await invoke<R>({
      className: NTClass.WINDOW_API,
      methodName: NTMethod.OPEN_EXTRA_WINDOW,
      cbCmd,
      afterFirstCmd: false,
      args: [ntQQWindow.windowName, ...args],
    })
    setTimeout(() => {
      for (const w of BrowserWindow.getAllWindows()) {
        // log("close window", w.webContents.getURL())
        if (w.webContents.getURL().indexOf(ntQQWindow.windowUrlHash) != -1) {
          w.close()
        }
      }
    }, autoCloseSeconds * 1000)
    return result
  }
}
