import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'

/** Returns the directory where all app config/data files should be stored.
 *  Packaged Windows: AppData\Local\feng-claude\   ← survives reinstalls/upgrades
 *  Packaged Mac/Linux: default userData
 *  Dev: default userData (AppData\Roaming\Feng Claude)
 */
export function getConfigDir(): string {
  if (app.isPackaged && process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return join(localAppData, 'feng-claude')
  }
  return app.getPath('userData')
}
