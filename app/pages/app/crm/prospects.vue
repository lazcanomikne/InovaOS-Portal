<script setup>
import { h, resolveComponent } from 'vue'
import axios from '~/utils/axios'

const UButton = resolveComponent('UButton')

const loading = ref(false)
const search = ref('')

// Filters
const filters = ref({
  year: new Date().getFullYear().toString(),
  month: (new Date().getMonth() + 1).toString(),
  slpCode: null,
  userSign: null
})

const yearOptions = ['2023', '2024', '2025', '2026']
const monthOptions = [
  { text: 'Enero', value: '1' },
  { text: 'Febrero', value: '2' },
  { text: 'Marzo', value: '3' },
  { text: 'Abril', value: '4' },
  { text: 'Mayo', value: '5' },
  { text: 'Junio', value: '6' },
  { text: 'Julio', value: '7' },
  { text: 'Agosto', value: '8' },
  { text: 'Septiembre', value: '9' },
  { text: 'Octubre', value: '10' },
  { text: 'Noviembre', value: '11' },
  { text: 'Diciembre', value: '12' }
]

const vendedorOptions = ref([{ name: 'Todos los vendedores', id: null }])
const creatorOptions = ref([{ name: 'Todos los creadores', id: null }])

// Data
const prospects = ref([])
const kpisData = ref({
  totalProspects: 0,
  newThisMonth: 0,
  topSalesPerson: 'N/A',
  topCreator: 'N/A'
})

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis en lugar de
// ensanchar la tabla. Mismo criterio que el pipeline.
const headers = [
  { title: 'Código', key: 'CardCode', align: 'start', sortable: true, w: 'w-[10%]' },
  { title: 'Nombre Cliente', key: 'CardName', align: 'start', sortable: true, w: 'w-[26%]' },
  { title: 'Creador', key: 'Creator', align: 'start', w: 'w-[13%]' },
  { title: 'Vendedor', key: 'SalesPerson', align: 'start', w: 'w-[14%]' },
  { title: 'Grupo', key: 'GroupName', align: 'start', w: 'w-[13%]' },
  { title: 'Fecha Creación', key: 'CreateDate', align: 'center', w: 'w-[9%]' },
  { title: 'Antigüedad', key: 'DaysSinceCreation', align: 'center', w: 'w-[8%]' },
  { title: 'Última Venta', key: 'LastSaleAmount', align: 'end', w: 'w-[7%]' }
]

const kpiCards = computed(() => [
  {
    title: 'Total Clientes',
    value: kpisData.value.totalProspects,
    subtitle: `Registrados en ${filters.value.year}`,
    icon: 'mdi-account-group',
    color: 'marca'
  },
  {
    title: 'Nuevos (Mes)',
    value: kpisData.value.newThisMonth,
    subtitle: 'Nuevas altas en el periodo',
    icon: 'mdi-account-plus',
    color: 'marcaClaro'
  },
  {
    title: 'Top Vendedor',
    value: kpisData.value.topSalesPerson,
    subtitle: 'Más clientes creados (Mes)',
    icon: 'mdi-trophy',
    color: 'gris'
  },
  {
    title: 'Top Creador',
    value: kpisData.value.topCreator,
    subtitle: 'Más actividad (Mes)',
    icon: 'mdi-account-star',
    color: 'grisClaro'
  }
])

const filteredProspects = computed(() => {
  if (!search.value) return prospects.value
  const s = search.value.toLowerCase()
  return prospects.value.filter(p =>
    p.CardName.toLowerCase().includes(s)
    || p.CardCode.toLowerCase().includes(s)
  )
})

// Actions
const fetchAll = async () => {
  loading.value = true
  try {
    const params = { ...filters.value }

    const [prospectsRes, kpiRes] = await Promise.all([
      axios.get('/crm/prospects', { params }),
      axios.get('/crm/prospects/kpis', { params })
    ])

    prospects.value = prospectsRes.data
    kpisData.value = kpiRes.data
  } catch (error) {
    console.error('Error fetching prospects data:', error)
  } finally {
    loading.value = false
  }
}

const fetchOptions = async () => {
  try {
    const slpRes = await axios.get('/crm/salespeople')
    vendedorOptions.value = [{ name: 'Todos los vendedores', id: null }, ...slpRes.data]

    const userRes = await axios.get('/crm/users')
    creatorOptions.value = [{ name: 'Todos los creadores', id: null }, ...userRes.data]
  } catch (error) {
    console.error('Error fetching options:', error)
  }
}

// Necesitamos una lista de vendedores con ID. El endpoint /salespeople actual solo da nombres.
// Voy a añadir un nuevo endpoint /salespeople-full o modificar el actual.
// Por ahora, como SlpCode es lo que espera el controller, intentaré obtener SlpCode.

const resetFilters = () => {
  filters.value = {
    year: new Date().getFullYear().toString(),
    month: (new Date().getMonth() + 1).toString(),
    slpCode: null,
    userSign: null
  }
  fetchAll()
}

const formatSimpleDate = (dateString) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '$0.00'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
}

// La antigüedad codifica ESTADO de atención (reciente / se enfría / inactivo),
// así que devuelve tokens semánticos de Nuxt UI directamente. Ya no hace falta
// traducir nombres de color de Vuetify.
const getDaysColor = (days) => {
  if (days < 30) return 'success'
  if (days < 90) return 'warning'
  return 'neutral'
}

// Los cuatro KPI son medidas distintas, no estados, así que usan la paleta de
// marca en vez de success/warning/info, que implicarían un juicio sobre el dato.
// Clases literales: Tailwind no detecta las construidas por interpolación.
const KPI_ICON_CLASS = {
  marca: 'text-primary',
  marcaClaro: 'text-primary-400',
  gris: 'text-ink-700 dark:text-ink-300',
  grisClaro: 'text-ink-500 dark:text-ink-400'
}

// Traducción de los headers de v-data-table a columnas TanStack para UTable.
const sorting = ref([])

const columns = computed(() => headers.map((hdr) => {
  const align = hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
  return {
    id: hdr.key,
    accessorKey: hdr.key,
    meta: {
      class: {
        // El ancho se declara en el th; con `table-fixed` el td lo hereda.
        th: [hdr.w, 'px-2 truncate', align].filter(Boolean).join(' '),
        // `truncate` recorta con elipsis en vez de ensanchar la columna.
        td: ['px-2 truncate', align].filter(Boolean).join(' ')
      }
    },
    // Encabezado compacto: el título se recorta y el icono de orden no empuja.
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      size: 'xs',
      label: hdr.title,
      title: hdr.title,
      class: '-mx-1.5 max-w-full min-w-0',
      ui: { label: 'truncate' },
      trailingIcon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up-narrow-wide'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down-wide-narrow'
          : 'i-lucide-arrow-up-down',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    })
  }
}))

// Distingue la primera carga (mostramos esqueletos) de las recargas por filtro,
// para que los indicadores no parpadeen al refiltrar.
const cargaInicial = computed(() => loading.value && !prospects.value.length)

// Año y mes siempre tienen valor, así que no cuentan como filtro activo.
const hayFiltros = computed(() =>
  !!search.value || filters.value.slpCode !== null || filters.value.userSign !== null
)

const limpiarFiltros = () => {
  search.value = ''
  resetFilters()
}

onMounted(() => {
  fetchOptions()
  fetchAll()
})
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="crm-prospects" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Nuevos Logos">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="primary"
            icon="i-mdi-refresh"
            label="Actualizar"
            :loading="loading"
            @click="fetchAll"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mb-4">
        <p class="text-muted">
          Seguimiento y Registro de Nuevos Clientes (SAP)
        </p>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al filtrar -->
        <UCard
          v-for="i in (cargaInicial ? 4 : 0)"
          :key="`kpi-skel-${i}`"
          class="h-full"
        >
          <div class="flex items-center justify-between mb-2">
            <USkeleton class="h-3 w-24" />
            <USkeleton class="size-6 rounded-full" />
          </div>
          <USkeleton class="h-7 w-20" />
          <USkeleton class="h-3 w-32 mt-2" />
        </UCard>

        <UCard
          v-for="(kpi, index) in (cargaInicial ? [] : kpiCards)"
          :key="index"
          class="h-full"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs uppercase tracking-wide font-bold text-muted">{{ kpi.title }}</span>
            <UIcon :name="`i-${kpi.icon}`" class="size-6 shrink-0" :class="KPI_ICON_CLASS[kpi.color]" />
          </div>
          <h3 class="text-2xl font-bold text-highlighted">
            {{ kpi.value }}
          </h3>
          <div class="mt-2 text-xs text-muted">
            {{ kpi.subtitle }}
          </div>
        </UCard>
      </div>

      <!-- Barra de filtros: siempre visible, no se comprime -->
      <UCard class="mb-6 shrink-0">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="Año" class="w-32">
            <USelect
              v-model="filters.year"
              :items="yearOptions"
              class="w-full"
              @update:model-value="fetchAll"
            />
          </UFormField>

          <UFormField label="Mes" class="w-40">
            <USelect
              v-model="filters.month"
              :items="monthOptions"
              label-key="text"
              value-key="value"
              class="w-full"
              @update:model-value="fetchAll"
            />
          </UFormField>

          <UFormField label="Vendedor" class="w-64">
            <USelectMenu
              v-model="filters.slpCode"
              :items="vendedorOptions"
              label-key="name"
              value-key="id"
              class="w-full"
              @update:model-value="fetchAll"
            />
          </UFormField>

          <UFormField label="Creador (Sistema)" class="w-64">
            <USelectMenu
              v-model="filters.userSign"
              :items="creatorOptions"
              label-key="name"
              value-key="id"
              class="w-full"
              @update:model-value="fetchAll"
            />
          </UFormField>

          <div class="flex-1" />

          <UTooltip text="Limpiar Filtros">
            <UButton
              icon="i-mdi-filter-off"
              color="neutral"
              variant="ghost"
              @click="resetFilters"
            />
          </UTooltip>
        </div>
      </UCard>

      <!-- Tabla principal: ocupa el espacio restante y scrollea por dentro -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <div class="flex items-center gap-4 p-4 border-b border-default shrink-0">
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Filtrar por nombre o código..."
            class="w-full max-w-md"
          />
          <div class="flex-1" />
          <span class="text-xs text-muted shrink-0">
            {{ filteredProspects.length }} clientes encontrados
          </span>
        </div>

        <UTable
          v-model:sorting="sorting"
          :data="filteredProspects"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="flex-1 min-h-0 overflow-y-auto"
          :ui="{
            base: 'table-fixed w-full',
            td: 'text-sm py-2',
            th: 'text-xs py-2'
          }"
        >
          <!-- Carga: filas fantasma en vez de un spinner suelto. Da sensación
               de rapidez porque la estructura aparece de inmediato. -->
          <template #loading>
            <div class="divide-y divide-default">
              <div
                v-for="i in 8"
                :key="`fila-skel-${i}`"
                class="flex items-center gap-4 px-2 py-3"
              >
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-28 shrink-0" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-16 shrink-0" />
              </div>
            </div>
          </template>

          <!-- Vacío: distingue "no hay nada" de "los filtros no dejan ver nada",
               y ofrece la acción correspondiente en cada caso. -->
          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon
                  :name="hayFiltros ? 'i-lucide-filter-x' : 'i-lucide-inbox'"
                  class="size-7 text-primary"
                />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                {{ hayFiltros ? 'Ningún cliente coincide con los filtros' : 'Aún no hay clientes nuevos' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba quitando algún filtro o ampliando la búsqueda.'
                  : `No se registraron altas de clientes en el periodo seleccionado de ${filters.year}.` }}
              </p>

              <UButton
                v-if="hayFiltros"
                label="Limpiar filtros"
                icon="i-lucide-circle-x"
                color="neutral"
                variant="subtle"
                @click="limpiarFiltros"
              />
              <UButton
                v-else
                label="Recargar"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="subtle"
                @click="fetchAll"
              />
            </div>
          </template>

          <template #CardCode-cell="{ row }">
            <span class="font-bold text-primary">{{ row.original.CardCode }}</span>
          </template>

          <template #CardName-cell="{ row }">
            <span class="block truncate" :title="row.original.CardName">
              {{ row.original.CardName }}
            </span>
          </template>

          <template #Creator-cell="{ row }">
            <span class="block truncate" :title="row.original.Creator">
              {{ row.original.Creator }}
            </span>
          </template>

          <template #SalesPerson-cell="{ row }">
            <span class="block truncate" :title="row.original.SalesPerson">
              {{ row.original.SalesPerson }}
            </span>
          </template>

          <template #GroupName-cell="{ row }">
            <span class="block truncate" :title="row.original.GroupName">
              {{ row.original.GroupName }}
            </span>
          </template>

          <template #CreateDate-cell="{ row }">
            {{ formatSimpleDate(row.original.CreateDate) }}
          </template>

          <template #LastSaleAmount-cell="{ row }">
            <span :class="row.original.LastSaleAmount > 0 ? 'text-success font-bold' : 'text-muted'">
              {{ formatCurrency(row.original.LastSaleAmount) }}
            </span>
          </template>

          <template #DaysSinceCreation-cell="{ row }">
            <UBadge
              size="sm"
              variant="solid"
              :color="getDaysColor(row.original.DaysSinceCreation)"
            >
              {{ row.original.DaysSinceCreation }} días
            </UBadge>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
