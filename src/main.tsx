import React from 'react'
import { flushSync } from 'react-dom'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { markAppPerformance } from './utils/appPerformance.ts'

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement)

markAppPerformance('react:render-start')
flushSync(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
markAppPerformance('react:render-committed')
