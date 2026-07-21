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

Las llamadas van a `/api`, que reenvía `server/api/[...ruta].js` a
`http://localhost:7002`. No hace falta configurar nada más si el backend corre
en esa máquina y ese puerto.

## Variables de entorno

Copia `.env.example` a `.env` y ajusta lo que necesites.

| Variable | Para qué sirve |
| --- | --- |
| `API_BASE` | URL del backend, **sin** `/api` al final (por ejemplo `http://mi-servidor:7002`). La lee el proxy de `server/api/[...ruta].js`. Si no se define, cae a `http://localhost:7002`. |
| `NUXT_PUBLIC_SITE_URL` | URL pública del sitio, usada para la imagen OG en `nuxt generate`. |

**La dirección del backend no está en este repositorio.** Es infraestructura y
este repo es público, así que se configura como variable de entorno en el panel
del hosting.

El navegador nunca habla con el backend directamente: siempre pide a `/api` de
su propio origen y el proxy del servidor reenvía. Esto no es opcional. El sitio
se sirve por HTTPS y el backend responde por HTTP, así que una llamada directa
desde el navegador sería bloqueada por contenido mixto.

## Despliegue

```bash
npm run build
```

En Vercel basta con definir `API_BASE` en las variables de entorno del proyecto.
`vercel.json` está en `.gitignore`: llevaba la IP del backend escrita a mano y,
con el proxy del servidor, ese archivo ya no hace falta.

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
