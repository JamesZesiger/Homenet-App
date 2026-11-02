// Preload for hosted apps (Immich etc.): runs in an isolated world, exposes
// nothing to the page, and adds controller and spatial navigation to pages we
// don't own. Back goes back in the app's own history, then to the launcher.
import { ipcRenderer } from 'electron'
import { startGamepad } from '../shared/input/intents'
import { installNav } from '../shared/input/spatial'

window.addEventListener('DOMContentLoaded', () => {
  const dispatch = installNav({
    back: () => ipcRenderer.send('guest:back'),
    home: () => ipcRenderer.send('guest:home'),
    pagePrev: () => history.back(),
    pageNext: () => history.forward(),
  })
  startGamepad(dispatch)
})
