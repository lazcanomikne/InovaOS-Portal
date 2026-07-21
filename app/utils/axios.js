// Cliente HTTP del portal.
// Se conserva axios (en vez de $fetch) a propósito: así toda la lógica de negocio
// de los views migrados sigue funcionando sin reescribir una sola llamada.
//
// Reglas del backend (no cambian):
//   - JWT en el header `Authorization` SIN prefijo "Bearer"
//   - Empresa activa en el header `X-Company`
import axios from 'axios'

// Siempre relativo. Quien decide a donde va realmente es el proxy de
// `server/api/[...ruta].js`, que corre del lado del servidor y lee la
// direccion del backend de la variable de entorno API_BASE.
//
// Es a proposito que el navegador nunca vea la URL del backend: Vercel sirve
// por HTTPS y el backend responde por HTTP, asi que una llamada directa desde
// el navegador seria bloqueada por contenido mixto.
const axiosServices = axios.create({
  baseURL: '/api',
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
