import React from 'react'
import { flushSync } from 'react-dom'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const appBackgroundColor = '#fff3e8'
const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement)

flushSync(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})

// Keep the native launch screen blue; switch only after React has committed.
const themeColorMeta = document.querySelector<HTMLMetaElement>(
  'meta[name="theme-color"]',
)
themeColorMeta?.setAttribute('content', appBackgroundColor)
document.documentElement.style.backgroundColor = appBackgroundColor
document.body.style.backgroundColor = appBackgroundColor
rootElement.style.backgroundColor = appBackgroundColor
