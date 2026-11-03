// Preload for hosted apps and streaming sites: runs in an isolated world,
// exposes nothing to the page, and adds controller and spatial navigation to
// pages we don't own. Back goes back in the page's own history, then to the
// launcher. On a provider's sign-in page it fills the login saved in the vault.
import { ipcRenderer } from 'electron'
import { startGamepad } from '../shared/input/intents'
import { installNav } from '../shared/input/spatial'
import type { Login } from '../main/vault'

const USERNAME = 'input[type=email], input[autocomplete=username], input[autocomplete=email], input[name*=email i], input[id*=email i], input[name*=user i]'
const PASSWORD = 'input[type=password]'

// Set a value the way typing would, so React/Vue-style pages notice it.
function fill(input: HTMLInputElement, value: string) {
  if (input.value || input.dataset.homeappFilled) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dataset.homeappFilled = '1'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

// Sign-in flows often ask for the email and the password on separate pages,
// so watch the page and fill whichever field turns up.
async function autofill() {
  if (!document.querySelector(PASSWORD) && !document.querySelector(USERNAME)) return
  const login = (await ipcRenderer.invoke('vault:fill')) as Login | null
  if (!login) return
  const visible = (el: HTMLInputElement) => el.getClientRects().length > 0
  const user = [...document.querySelectorAll<HTMLInputElement>(USERNAME)].find(visible)
  const pass = [...document.querySelectorAll<HTMLInputElement>(PASSWORD)].find(visible)
  if (user) fill(user, login.username)
  if (pass) fill(pass, login.password)
}

window.addEventListener('DOMContentLoaded', async () => {
  // A TV page (YouTube's) has its own remote navigation: the controller
  // presses its keys, and the keyboard is left alone.
  if (await ipcRenderer.invoke('guest:tv')) {
    startGamepad((intent) => ipcRenderer.send(intent === 'home' ? 'guest:home' : 'guest:key', intent))
    return
  }
  const dispatch = installNav({
    back: () => ipcRenderer.send('guest:back'),
    home: () => ipcRenderer.send('guest:home'),
    pagePrev: () => history.back(),
    pageNext: () => history.forward(),
  })
  startGamepad(dispatch)

  let pending = 0
  new MutationObserver(() => {
    clearTimeout(pending)
    pending = window.setTimeout(autofill, 300)
  }).observe(document.body, { childList: true, subtree: true })
  autofill()
})
