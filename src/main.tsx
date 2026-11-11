if (
  typeof performance !== 'undefined' &&
  performance.getEntriesByName('tc_app_bootstrap_start').length === 0
) {
  performance.mark('tc_app_bootstrap_start')
}
import React from 'react'
import { flushSync } from 'react-dom'
import ReactDOM from 'react-dom/client'
import processShim from 'process'
import './index.css'

// ExcelJS's browser build uses readable-stream, which expects process.nextTick.
// Install the browser shim before loading the application dependency graph.
const processGlobal = globalThis as typeof globalThis & { process?: typeof processShim }
processGlobal.process ??= processShim

const bootstrap = async () => {
  const { default: App } = await import('./App.tsx')
  const rootElement = document.getElementById('root')!
  const root = ReactDOM.createRoot(rootElement)

  flushSync(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
}

void bootstrap()
