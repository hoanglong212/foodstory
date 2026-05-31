import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'bootstrap/dist/css/bootstrap-grid.min.css'
import './style.css'
import App from './App.vue'
import router from './router'
import permission from './directives/permission'

const app = createApp(App)
const pinia = createPinia()

app.directive('focus', {
  mounted(el) {
    el.focus()
  },
})
app.directive('permission', permission)

app.use(pinia)
app.use(router)
app.mount('#app')
