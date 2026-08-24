import React from 'react'
import { flushSync } from 'react-dom'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement)

flushSync(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
