import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled, not fetched from Google: the app makes no requests off this machine.
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.jsx'
import ViewBoundary from './components/ViewBoundary'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ViewBoundary full title="Keystone hit an error">
      <App />
    </ViewBoundary>
  </StrictMode>,
)
