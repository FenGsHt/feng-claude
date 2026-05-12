import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/local-fonts.css'
import './styles/globals.css'
import { injectMockElectronAPI } from './electronMock'

injectMockElectronAPI()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
