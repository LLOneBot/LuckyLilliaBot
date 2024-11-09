import { BrowserWindow } from 'electron'
import { log } from '@/common/utils'

export function getAllWindowIds(): number[] {
  const allWindows = BrowserWindow.getAllWindows();
  const ids = allWindows.map(window => window.id);
  log('getAllWindowIds', ids);
  return ids;
}
