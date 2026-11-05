import { render } from 'preact'
import { App } from './app'
import { store } from './lib/store'
import './styles/tokens.css'
import './styles/components.css'

await store.init()
render(<App />, document.getElementById('app')!)

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js')
