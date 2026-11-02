import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startGamepad } from '../../shared/input/intents'
import { installNav } from '../../shared/input/spatial'
import { App } from './App'
import './styles.css'

const openLayer = (layer: 'search' | 'settings') =>
  window.dispatchEvent(new CustomEvent('homeapp:layer', { detail: layer }))

// The launcher is home: Back closes whatever layer is open (the nav sends it
// Escape) and otherwise does nothing; it never exits.
startGamepad(installNav({
  back: () => {},
  menu: () => openLayer('settings'),
  search: () => openLayer('search'),
}))

// "/" opens search from the keyboard, like X on the controller.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault()
    openLayer('search')
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
