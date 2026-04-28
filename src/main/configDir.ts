import { app } from 'electron'
import { join, dirname } from 'path'

/** Returns the directory where all app config/data files should be stored.
 *  Packaged: <exeDir>/data/   (e.g. AppData\Local\Programs\feng-claude\data)
 *  Dev:      default userData  (AppData\Roaming\Feng Claude)
 */
export function getConfigDir(): string {
  if (app.isPackaged) {
    return join(dirname(app.getPath('exe')), 'data')
  }
  return app.getPath('userData')
}
