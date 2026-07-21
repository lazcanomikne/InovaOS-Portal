<script setup>
import { h, resolveComponent } from 'vue'
import axios from '~/utils/axios'
import InvoiceDetailDialog from '~/components/crm/InvoiceDetailDialog.vue'

const UButton = resolveComponent('UButton')

const loading = ref(false)
const invoices = ref([])
const search = ref('')
const filters = ref({
  vendedor: null,
  estatusPago: null,
  year: new Date().getFullYear().toString(),
  month: (new Date().getMonth() + 1).toString() // Mes actual
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

// Dialog State
const dialogOpen = ref(false)
const selectedInvoice = ref(null)

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis en lugar de
// ensanchar la tabla y provocar scroll horizontal. Mismo criterio que el pipeline.
const headers = [
  { title: 'Folio', key: 'Folio', align: 'start', w: 'w-[9%]' },
  { title: 'Cliente', key: 'Cliente', align: 'start', w: 'w-[26%]' },
  { title: 'Fecha', key: 'Fecha', align: 'start', w: 'w-[10%]' },
  { title: 'Vendedor', key: 'Vendedor', align: 'start', w: 'w-[15%]' },
  { title: 'Estatus Pago', key: 'EstatusPago', align: 'center', w: 'w-[11%]' },
  { title: 'Venta Neta', key: 'VentaNetaMXN', align: 'end', w: 'w-[11%]' },
  { title: 'Utilidad', key: 'UtilidadMXN', align: 'end', w: 'w-[10%]' },
  { title: '% Margen', key: 'PorcentajeMargen', align: 'center', w: 'w-[8%]' }
]

const fetchInvoices = async () => {
  loading.value = true
  try {
    const response = await axios.get('/crm/invoices', {
      params: {
        year: filters.value.year,
        month: filters.value.month
      }
    })
    invoices.value = response.data
  } catch (error) {
    console.error('Error al cargar facturas:', error)
  } finally {
    loading.value = false
  }
}

const openDialog = (item) => {
  selectedInvoice.value = item
  dialogOpen.value = true
}

// Options
const vendedorOptions = computed(() => {
  const list = invoices.value.map(item => item.Vendedor)
  return [...new Set(list)].sort()
})

// Filtering
const filteredInvoices = computed(() => {
  return invoices.value.filter((item) => {
    const matchSearch = !search.value
      || item.Cliente.toLowerCase().includes(search.value.toLowerCase())
      || item.Folio.toString().includes(search.value)
      || item.Vendedor.toLowerCase().includes(search.value.toLowerCase())

    const matchVendedor = !filters.value.vendedor || item.Vendedor === filters.value.vendedor
    const matchStatus = !filters.value.estatusPago || item.EstatusPago === filters.value.estatusPago

    return matchSearch && matchVendedor && matchStatus
  })
})

// KPIs
const totalNetSales = computed(() => filteredInvoices.value.reduce((acc, item) => acc + item.VentaNetaMXN, 0))
const totalProfit = computed(() => filteredInvoices.value.reduce((acc, item) => acc + item.UtilidadMXN, 0))
const appliedProfit = computed(() => {
  return filteredInvoices.value
    .filter(item => item.EstatusPago === 'Pagada')
    .reduce((acc, item) => acc + item.UtilidadMXN, 0)
})
const averageMargin = computed(() => {
  if (filteredInvoices.value.length === 0) return 0
  const totalMargin = filteredInvoices.value.reduce((acc, item) => acc + item.PorcentajeMargen, 0)
  return totalMargin / filteredInvoices.value.length
})

// Formatters
const formatCurrency = (value, currency) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN'
  }).format(value)
}

const formatPercent = (value) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100)
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('es-MX')
}

// Colores. Ambos casos codifican ESTADO (cobranza y salud del margen), así que
// devuelven directamente tokens semánticos de Nuxt UI; ya no hace falta traducir
// nombres de color de Vuetify.
const getPaymentStatusColor = (status) => {
  switch (status) {
    case 'Pagada': return 'success'
    case 'Parcial': return 'warning'
    case 'Pendiente': return 'error'
    default: return 'neutral'
  }
}

const getMarginColor = (margin) => {
  if (margin > 20) return 'success'
  if (margin < 10) return 'error'
  return 'warning' // Entre 10 y 20 (o por omisión)
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

// Distingue la primera carga (mostramos esqueletos) de las recargas por filtro
// (mantenemos los datos visibles para que la pantalla no parpadee).
const cargaInicial = computed(() => loading.value && !invoices.value.length)

// Año y mes siempre tienen valor, así que no cuentan como filtro activo.
const hayFiltros = computed(() =>
  !!search.value || !!filters.value.vendedor || !!filters.value.estatusPago
)

const limpiarFiltros = () => {
  search.value = ''
  filters.value.vendedor = null
  filters.value.estatusPago = null
}

onMounted(() => {
  fetchInvoices()
})
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="crm-commercial-management" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Gestión Comercial">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="primary"
            icon="i-mdi-refresh"
            label="Actualizar"
            :loading="loading"
            @click="fetchInvoices"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mb-4">
        <p class="text-muted">
          Facturas de Clientes (SAP B1 OINV)
        </p>
      </div>

      <!-- KPIs. Son cinco medidas distintas, no estados: usan la paleta de marca
           (azul que se intensifica, gris para lo derivado). Los semánticos
           success/warning/error quedan para el estatus de cobranza y el margen,
           donde sí expresan un juicio sobre el dato. -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al filtrar -->
        <template v-if="cargaInicial">
          <UCard
            v-for="i in 5"
            :key="`kpi-skel-${i}`"
            :ui="{ body: 'text-center' }"
            class="border-t-4 border-t-default"
          >
            <USkeleton class="h-3 w-20 mx-auto mb-2" />
            <USkeleton class="h-7 w-24 mx-auto" />
          </UCard>
        </template>

        <template v-else>
          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-primary-300 dark:border-t-primary-400">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Facturas
            </div>
            <div class="text-2xl font-bold text-primary-500 dark:text-primary-300">
              {{ filteredInvoices.length }}
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-primary">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Venta Neta
            </div>
            <div class="text-2xl font-bold text-primary">
              {{ formatCurrency(totalNetSales) }}
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-primary-400">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Utilidad Total
            </div>
            <div class="text-xl font-bold text-primary-500 dark:text-primary-400">
              {{ formatCurrency(totalProfit) }}
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-ink-800 dark:border-t-ink-300">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Utilidad Aplicada
            </div>
            <div class="text-xl font-bold text-ink-800 dark:text-ink-200">
              {{ formatCurrency(appliedProfit) }}
            </div>
            <div class="text-[0.65rem] text-dimmed">
              Pagadas
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-ink-600 dark:border-t-ink-400">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Margen Promedio
            </div>
            <div class="text-2xl font-bold text-ink-700 dark:text-ink-300">
              {{ formatPercent(averageMargin) }}
            </div>
          </UCard>
        </template>
      </div>

      <!-- La tarjeta ocupa el espacio restante y es la única que scrollea por
           dentro: los indicadores y los filtros quedan siempre a la vista. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <div class="p-4 bg-elevated/30 border-b border-default shrink-0">
          <!-- Búsqueda global -->
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Búsqueda rápida (Cliente, Folio, Vendedor...)"
            size="lg"
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="search" #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-circle-x"
                aria-label="Limpiar búsqueda"
                @click="search = ''"
              />
            </template>
          </UInput>

          <USeparator class="my-4" />

          <!-- Filtros específicos -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <UFormField label="Año">
              <USelect
                v-model="filters.year"
                :items="yearOptions"
                class="w-full"
                @update:model-value="fetchInvoices"
              />
            </UFormField>

            <UFormField label="Mes">
              <USelect
                v-model="filters.month"
                :items="monthOptions"
                label-key="text"
                value-key="value"
                class="w-full"
                @update:model-value="fetchInvoices"
              />
            </UFormField>

            <UFormField label="Vendedor">
              <USelectMenu
                v-model="filters.vendedor"
                :items="vendedorOptions"
                icon="i-mdi-account-tie"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Estatus Pago">
              <USelect
                v-model="filters.estatusPago"
                :items="['Pagada', 'Parcial', 'Pendiente']"
                icon="i-mdi-cash-multiple"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>

        <UTable
          v-model:sorting="sorting"
          :data="filteredInvoices"
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
                <USkeleton class="h-4 w-16 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-28 shrink-0" />
                <USkeleton class="h-4 w-24 shrink-0" />
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
                {{ hayFiltros ? 'Ninguna factura coincide con los filtros' : 'Aún no hay facturas' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba quitando algún filtro o ampliando la búsqueda.'
                  : `No se encontraron facturas en el periodo seleccionado de ${filters.year}.` }}
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
                @click="fetchInvoices"
              />
            </div>
          </template>

          <template #Folio-cell="{ row }">
            <span
              class="text-primary font-bold cursor-pointer underline"
              @click="openDialog(row.original)"
            >
              {{ row.original.Folio }}
            </span>
          </template>

          <template #Cliente-cell="{ row }">
            <span class="block truncate" :title="row.original.Cliente">
              {{ row.original.Cliente }}
            </span>
          </template>

          <template #Vendedor-cell="{ row }">
            <span class="block truncate" :title="row.original.Vendedor">
              {{ row.original.Vendedor }}
            </span>
          </template>

          <template #Fecha-cell="{ row }">
            {{ formatDate(row.original.Fecha) }}
          </template>

          <template #EstatusPago-cell="{ row }">
            <UBadge
              :color="getPaymentStatusColor(row.original.EstatusPago)"
              variant="solid"
              size="sm"
              class="font-bold"
            >
              {{ row.original.EstatusPago }}
            </UBadge>
          </template>

          <template #VentaNetaMXN-cell="{ row }">
            <div class="flex flex-col items-end">
              <span class="font-bold">{{ formatCurrency(row.original.VentaNetaMXN) }}</span>
              <span class="text-xs text-dimmed">USD: {{ formatCurrency(row.original.VentaNetaUSD, 'USD') }}</span>
            </div>
          </template>

          <template #UtilidadMXN-cell="{ row }">
            <div class="flex flex-col items-end">
              <span class="font-bold text-success">{{ formatCurrency(row.original.UtilidadMXN) }}</span>
              <span class="text-xs text-dimmed">USD: {{ formatCurrency(row.original.UtilidadUSD, 'USD') }}</span>
            </div>
          </template>

          <template #PorcentajeMargen-cell="{ row }">
            <UBadge
              :color="getMarginColor(row.original.PorcentajeMargen)"
              variant="soft"
              size="sm"
              class="font-bold"
            >
              {{ formatPercent(row.original.PorcentajeMargen) }}
            </UBadge>
          </template>
        </UTable>
      </UCard>

      <InvoiceDetailDialog
        v-model="dialogOpen"
        :folio="selectedInvoice?.Folio"
        :doc-entry="selectedInvoice?.DocEntry"
        :header="selectedInvoice"
      />
    </template>
  </UDashboardPanel>
</template>
