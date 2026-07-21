// Menú lateral dinámico servido por SQL (GET /admin/my-menu).
//
// IMPORTANTE: los `Path` viven en la base de datos (tabla de menús) y ya apuntan
// a rutas /app/... Por eso el árbol de páginas de Nuxt replica exactamente esa
// estructura: si cambia una ruta aquí, hay que cambiarla en SQL o el menú se rompe.
//
// El backend devuelve: { Title, Path, Icon, children: [{ Title, Path }] }
// Nuxt UI espera:      { label, to, icon, children: [{ label, to }] }
//
// Los iconos siguen siendo de la colección `solar` (los mismos valores que ya
// están guardados en SQL), por eso se instala @iconify-json/solar.
import axios from '~/utils/axios'

export const useMenu = () => {
  const items = useState('menu-items', () => [])
  const cargado = useState('menu-cargado', () => false)

  const fetchMenu = async () => {
    if (!import.meta.client) return
    if (!localStorage.getItem('token')) return

    try {
      const { data } = await axios.get('/admin/my-menu')

      items.value = (data || []).map(item => ({
        label: item.Title,
        to: item.Path || undefined,
        icon: item.Icon ? `solar:${item.Icon}` : undefined,
        // Un item con hijos se comporta como acordeón en UNavigationMenu
        ...(item.children?.length
          ? {
              type: 'trigger',
              children: item.children.map(child => ({
                label: child.Title,
                to: child.Path
              }))
            }
          : {})
      }))

      cargado.value = true
    } catch {
      // Sin menú no bloqueamos la app: el usuario puede navegar por URL.
      items.value = []
    }
  }

  return { items, cargado, fetchMenu }
}
