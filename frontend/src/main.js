import { createApp } from 'vue'
import { createPinia } from 'pinia'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import 'bootstrap/dist/css/bootstrap-grid.min.css'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './style.css'
import App from './App.vue'
import router from './router'
import permission from './directives/permission'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

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
