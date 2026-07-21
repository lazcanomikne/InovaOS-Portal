// Guard global de autenticación.
// Replica el comportamiento del portal actual: sin token -> /login;
// con token en /login -> al dashboard. La raíz redirige según sesión.
export default defineNuxtRouteMiddleware((to) => {
  // En SPA (ssr:false) esto siempre corre en cliente, pero el guard evita
  // cualquier ejecución en servidor durante el prerender del shell.
  if (import.meta.server) return

  const token = localStorage.getItem('token')
  const esLogin = to.path === '/login'

  if (to.path === '/') {
    return navigateTo(token ? '/app/dashboard' : '/login')
  }

  if (!token && !esLogin) {
    return navigateTo('/login')
  }

  if (token && esLogin) {
    return navigateTo('/app/dashboard')
  }
})
