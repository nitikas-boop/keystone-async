import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled, not fetched from Google: the app makes no requests off this machine.
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
