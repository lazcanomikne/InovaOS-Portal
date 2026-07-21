# InovaOS Portal

Front del portal Inovatech: CRM, Tesorería, Recursos Humanos, Logística e
Ingeniería, sobre Nuxt 4 + Nuxt UI v4.

Corre en **modo SPA** (`ssr: false`) a propósito: la sesión vive en
`localStorage` y toda la data se pide a un backend Express existente con los
headers `Authorization` y `X-Company`. Con SSR habría que rehacer el modelo de
autenticación; en SPA se porta tal cual.

## Requisitos

- Node 22.18 o superior (algunas dependencias lo piden explícitamente)
- El backend del portal corriendo y accesible

## Desarrollo

```bash
npm install
npm run dev
```

Las llamadas van a `/api`, que el proxy de Vite redirige a `http://localhost:7002`
(ver `nuxt.config.ts`). No hace falta configurar nada más si el backend corre en
esa máquina y ese puerto.

## Variables de entorno

Copia `.env.example` a `.env` y ajusta lo que necesites.

| Variable | Para qué sirve |
| --- | --- |
| `NUXT_PUBLIC_API_BASE` | URL base del backend, incluyendo `/api`. Si se deja vacía se usa la ruta relativa `/api`, que en desarrollo resuelve el proxy de Vite. |
| `NUXT_PUBLIC_SITE_URL` | URL pública del sitio, usada para la imagen OG en `nuxt generate`. |

**La dirección del backend no está en este repositorio.** Es infraestructura y
este repo es público, así que se configura como variable de entorno en el panel
del hosting. El backend expone CORS abierto, de modo que el navegador puede
llamarlo directo sin necesidad de una reescritura intermedia.

## Despliegue

```bash
npm run build
```

En Vercel basta con definir `NUXT_PUBLIC_API_BASE` en las variables de entorno
del proyecto. `vercel.json` está en `.gitignore`: la versión anterior llevaba la
IP del backend escrita a mano y, con la variable de entorno, ese archivo ya no
hace falta.

## Estructura

```
app/
  assets/css/main.css    Paleta de marca, color por empresa y estilos globales
  components/            Componentes compartidos
  composables/           useMenu, useFiltroPeriodo, ...
  layouts/               Shell del dashboard (sidebar, notificaciones, chat)
  pages/app/             Una carpeta por área: crm, tesoreria, rh, operaciones, ingenieria
  stores/                Pinia: auth, company, chat, notifications
  utils/axios.js         Cliente HTTP con los headers del backend
```

El menú lateral **no está en el código**: se arma desde SQL
(`MenuItems` / `RolePermissions`) vía `/api/admin/my-menu`. Cambiar la ruta de
una página exige actualizar también su registro en la base.

## Convenciones

- Código y comentarios en español, igual que el resto del proyecto.
- Sin emojis en la interfaz: se usan iconos de `mdi` o `solar`.
- Las tablas usan `table-fixed` con anchos en porcentaje, para que quepan sin
  scroll horizontal. El scroll vive en el contenedor de la tabla, no en la
  página.
- Las clases de Tailwind se escriben completas. Las armadas por interpolación
  (`text-${color}`) no se generan, porque Tailwind analiza el código como texto.
