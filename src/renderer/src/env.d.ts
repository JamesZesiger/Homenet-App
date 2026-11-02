/// <reference types="vite/client" />
import type { ShellApi } from '../../shared/types'

declare global {
  interface Window {
    homeapp: ShellApi
  }
}
