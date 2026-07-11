import { App } from './app'

const app = new App()
const root = document.getElementById('app')

if (root) {
  app.mount(root)
} else {
  console.error('App root element not found')
}
