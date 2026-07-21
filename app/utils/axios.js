// Cliente HTTP del portal.
// Se conserva axios (en vez de $fetch) a propósito: así toda la lógica de negocio
// de los views migrados sigue funcionando sin reescribir una sola llamada.
//
// Reglas del backend (no cambian):
//   - JWT en el header `Authorization` SIN prefijo "Bearer"
//   - Empresa activa en el header `X-Company`
import axios from 'axios'

// La base sale de `NUXT_PUBLIC_API_BASE`. Sin esa variable queda en `/api`,
// relativo, que es lo que resuelve el proxy de Vite en desarrollo apuntando a
// localhost:7002.
//
// La URL del backend NO va en el repositorio: es infraestructura, y este repo
// es publico. Se configura como variable de entorno en el hosting.
const baseURL = import.meta.env.NUXT_PUBLIC_API_BASE
  || import.meta.env.VITE_API_BASE
  || '/api'

const axiosServices = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' }
})

axiosServices.interceptors.request.use(
  (config) => {
    // localStorage sólo existe en el cliente. La app corre en modo SPA
    // (ssr: false), pero este guard evita cualquier sorpresa en prerender.
    if (import.meta.client) {
      const token = localStorage.getItem('token')
      if (token) config.headers.Authorization = token
      config.headers['X-Company'] = localStorage.getItem('currentCompany') || 'SBOINOVA'
    }
    return config
  },
  error => Promise.reject(error)
)

// Sesión vencida: el JWT dura 8 h. Sin esto, al expirar el token cada llamada
// devuelve 401, los `catch` de las vistas sólo escriben en consola y el usuario
// ve pantallas vacías sin ninguna explicación. Aquí lo hacemos explícito:
// se limpia la sesión y se manda al login.
axiosServices.interceptors.response.use(
  response => response,
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url || ''
    // Las rutas de /auth manejan sus propios errores (código incorrecto, etc.)
    if (status === 401 && import.meta.client && !url.includes('/auth/')) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }
    return Promise.reject(error)
  }
)

export default axiosServices
