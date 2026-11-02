import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startGamepad } from '../../shared/input/intents'
import { installNav } from '../../shared/input/spatial'
import { App } from './App'
import './styles.css'

// The launcher is home: Back closes whatever view is open and never exits.
startGamepad(installNav({ back: () => window.dispatchEvent(new Event('homeapp:back')) }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
