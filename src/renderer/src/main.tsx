import React from 'react'
import ReactDOM from 'react-dom/client'
import { initI18n } from '@modules/translations/renderer/i18n'
import { App } from './App'
import './styles.css'

initI18n('ar')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
