# Convenciones de migración: Vuetify 3 → Nuxt UI v4

Referencia obligatoria para migrar cada view del portal. El objetivo es que
todos los módulos queden consistentes entre sí.

## Reglas que no se negocian

1. **La lógica de negocio se preserva tal cual.** Todo lo que está dentro de
   `<script setup>` (llamadas a la API, cálculos, validaciones, formateo) se
   copia sin cambios de comportamiento. Lo que se reescribe es el `<template>`.
2. **Se conserva `axios`.** Las llamadas siguen siendo `axios.get('/ruta')`.
   Sólo cambia el import: `@/utils/axios` → `~/utils/axios`.
3. **Las rutas `/app/...` no cambian.** Están guardadas en SQL (tabla de menús).
   Si una ruta cambia, el menú del portal se rompe.
4. **Sin emojis** en código, UI ni textos. Usar iconos (`solar:` o `i-mdi-`).
5. **Todo en español**, igual que el portal actual.

## Estructura obligatoria de cada página

```vue
<script setup>
import axios from '~/utils/axios'
// imports de stores: ~/stores/xxx
</script>

<template>
  <UDashboardPanel id="identificador-unico">
    <template #header>
      <UDashboardNavbar title="Título del módulo">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <!-- acciones: botones, filtros -->
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- contenido -->
    </template>
  </UDashboardPanel>
</template>
```

Excepción: páginas de impresión (`/print/...`) usan `definePageMeta({ layout: false })`.

## Tabla de equivalencias

| Vuetify | Nuxt UI | Notas |
|---|---|---|
| `v-card` | `UCard` | |
| `v-card-title` | slot `#header` de `UCard` | |
| `v-card-text` | slot por defecto | |
| `v-card-actions` | slot `#footer` | |
| `v-btn` | `UButton` | `variant="elevated"`→`solid`, `text`→`ghost`, `outlined`→`outline` |
| `v-text-field` | `UInput` dentro de `UFormField` | el `label` va en `UFormField` |
| `v-textarea` | `UTextarea` | |
| `v-select` | `USelect` o `USelectMenu` | `USelectMenu` si necesita búsqueda |
| `v-checkbox` | `UCheckbox` | |
| `v-switch` | `USwitch` | |
| `v-dialog` | `UModal` | contenido en slot `#content` o `#body` |
| `v-data-table` | `UTable` | ver sección aparte |
| `v-chip` | `UBadge` | |
| `v-alert` | `UAlert` | |
| `v-icon` | `UIcon` | `mdi-x` → `i-mdi-x` |
| `v-avatar` | `UAvatar` | |
| `v-divider` | `USeparator` | |
| `v-tooltip` | `UTooltip` | |
| `v-badge` | `UChip` | |
| `v-menu` | `UDropdownMenu` | |
| `v-tabs` | `UTabs` | |
| `v-expansion-panels` | `UAccordion` | |
| `v-snackbar` | `useToast().add({ title })` | |
| `v-progress-circular` | `UIcon name="i-lucide-loader-circle" class="animate-spin"` | |
| `v-progress-linear` | `UProgress` | |
| `v-skeleton-loader` | `USkeleton` | |
| `v-pagination` | `UPagination` | |

## Layout: Vuetify grid → Tailwind

| Vuetify | Tailwind |
|---|---|
| `v-container` | `<div class="p-4">` o nada (UDashboardPanel ya da padding) |
| `v-row` | `<div class="grid grid-cols-12 gap-4">` o `flex gap-4` |
| `v-col cols="12" md="6"` | `class="col-span-12 md:col-span-6"` |
| `v-spacer` | `<div class="flex-1" />` |
| `class="d-flex align-center"` | `class="flex items-center"` |
| `class="text-h6"` | `class="text-lg font-semibold"` |
| `class="mb-4"` | `class="mb-4"` (igual) |
| `class="text-grey"` | `class="text-muted"` |

## Colores semánticos de Nuxt UI

Usar los tokens del tema, no colores fijos: `text-highlighted` (texto fuerte),
`text-muted` / `text-dimmed` (secundario), `bg-elevated`, `border-default`.
Para estados: `color="success" | "error" | "warning" | "info" | "neutral"`.

## UTable (el punto más delicado)

`v-data-table` usa `headers`; `UTable` usa `columns` con TanStack Table:

```js
const columns = [
  { accessorKey: 'nombre', header: 'Nombre' },
  {
    accessorKey: 'monto',
    header: 'Monto',
    cell: ({ row }) => formatoMoneda(row.original.monto)
  }
]
```

```vue
<UTable :data="filas" :columns="columns" :loading="cargando" />
```

- `v-data-table` con `:items` → `UTable` con `:data`
- Los slots `item.campo` de Vuetify se vuelven la función `cell` de la columna.
- Para celdas con componentes, usar `h()` importado de `vue`, o un slot
  `#nombre-cell="{ row }"` en el template (más legible; preferir esta forma).

## Notificaciones al usuario

Reemplazar `v-snackbar` por el toast de Nuxt UI:

```js
const toast = useToast()
toast.add({ title: 'Guardado', color: 'success' })
toast.add({ title: 'Error', description: msg, color: 'error' })
```

## Confirmaciones

Vuetify usaba diálogos propios. Usar `UModal` con estado local:

```vue
<UModal v-model:open="confirmarAbierto" title="¿Eliminar?">
  <template #footer>
    <UButton color="neutral" variant="ghost" @click="confirmarAbierto = false">Cancelar</UButton>
    <UButton color="error" @click="eliminar">Eliminar</UButton>
  </template>
</UModal>
```

## Mapa de rutas (URL en SQL → archivo Nuxt)

| URL (no cambiar) | Archivo | Origen |
|---|---|---|
| `/app/dashboard` | `app/pages/app/dashboard.vue` | `views/Dashboard.vue` |
| `/app/perfil` | `app/pages/app/perfil.vue` | `views/Profile.vue` |
| `/app/notes` | `app/pages/app/notes.vue` | `views/Notes.vue` |
| `/app/chat`, `/app/chat/:id` | `app/pages/app/chat/[[id]].vue` | `views/Chat.vue` |
| `/app/inovaos/home` | `app/pages/app/inovaos/home.vue` | `views/inovaos/InovaHome.vue` |
| `/app/inovaos/pendientes` | `app/pages/app/inovaos/pendientes.vue` | `InovaPendientes.vue` |
| `/app/inovaos/tablero` | `app/pages/app/inovaos/tablero.vue` | `InovaTablero.vue` |
| `/app/inovaos/crear` | `app/pages/app/inovaos/crear.vue` | `InovaCrear.vue` |
| `/app/inovaos/metricas` | `app/pages/app/inovaos/metricas.vue` | `InovaMetricas.vue` |
| `/app/tesoreria/efectivo/sobres` | `app/pages/app/tesoreria/efectivo/sobres.vue` | `tesoreria/CajaChica.vue` |
| `/app/tesoreria/monitor` | `app/pages/app/tesoreria/monitor.vue` | `tesoreria/Sobres.vue` |
| `/app/tesoreria/conteo-efectivo` | `app/pages/app/tesoreria/conteo-efectivo.vue` | `ConteoEfectivo.vue` |
| `/app/tesoreria/conciliacion` | `app/pages/app/tesoreria/conciliacion.vue` | `Conciliacion.vue` |
| `/app/tesoreria/libro-mayor` | `app/pages/app/tesoreria/libro-mayor.vue` | `LibroMayor.vue` |
| `/app/admin/users` | `app/pages/app/admin/users.vue` | `admin/Users.vue` |
| `/app/admin/usuarios` | `app/pages/app/admin/usuarios.vue` | `admin/UsuariosAdmin.vue` |
| `/app/gestion/tesoreria/sobres` | `app/pages/app/gestion/tesoreria/sobres.vue` | `CatSobres.vue` |
| `/app/gestion/tesoreria/categorias` | `app/pages/app/gestion/tesoreria/categorias.vue` | `CatCategorias.vue` |
| `/app/rh/vacaciones/solicitar` | `app/pages/app/rh/vacaciones/solicitar.vue` | `SolicitarVacaciones.vue` |
| `/app/rh/vacaciones/mis-vacaciones` | `app/pages/app/rh/vacaciones/mis-vacaciones.vue` | `MyVacations.vue` |
| `/app/rh/vacaciones/autorizaciones` | `app/pages/app/rh/vacaciones/autorizaciones.vue` | `AuthorizationCenter.vue` |
| `/app/rh/vacaciones/calendario-equipo` | `app/pages/app/rh/vacaciones/calendario-equipo.vue` | `TeamCalendar.vue` |
| `/app/rh/vacaciones/reportes` | `app/pages/app/rh/vacaciones/reportes.vue` | `Reports.vue` |
| `/app/rh/vacaciones/calendario` | `app/pages/app/rh/vacaciones/calendario.vue` | `AbsenceCalendar.vue` |
| `/app/operaciones/ruta` | `app/pages/app/operaciones/ruta.vue` | `operaciones/Ruta.vue` |
| `/app/operaciones/flotilla` | `app/pages/app/operaciones/flotilla.vue` | `operaciones/Flotilla.vue` |
| `/app/ingenieria/helpdesk` | `app/pages/app/ingenieria/helpdesk.vue` | `ingenieria/Helpdesk.vue` |
| `/app/crm/dashboard` | `app/pages/app/crm/dashboard.vue` | `crm/CrmDashboard.vue` |
| `/app/crm/pipeline` | `app/pages/app/crm/pipeline.vue` | `crm/PipelineManager.vue` |
| `/app/crm/prospects` | `app/pages/app/crm/prospects.vue` | `crm/ProspectsList.vue` |
| `/app/crm/commercial-management` | `app/pages/app/crm/commercial-management.vue` | `CommercialManagement.vue` |
| `/app/crm/opportunities` | `app/pages/app/crm/opportunities/index.vue` | `crm/OpportunityList.vue` |
| `/app/crm/opportunities/:id` | `app/pages/app/crm/opportunities/[id].vue` | `crm/OpportunityDetail.vue` |
| `/app/crm/backlog` | `app/pages/app/crm/backlog.vue` | `crm/BacklogManager.vue` |
| `/print/quote/:folio` | `app/pages/print/quote/[folio].vue` | `crm/PrintQuote.vue` (sin layout) |

## Stores disponibles

`~/stores/auth`, `~/stores/company`, `~/stores/chat`, `~/stores/notifications`,
`~/stores/notes`, `~/stores/inovaos`. La API es idéntica a la del portal actual.

Nota: el store `inovaos` ya no tiene `snack`; usar `useToast()` en su lugar.
