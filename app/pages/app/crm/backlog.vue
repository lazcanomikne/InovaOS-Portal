<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from '~/utils/axios'
import BacklogDetailDialog from '~/components/crm/BacklogDetailDialog.vue'

const loading = ref(false)
const orders = ref([])
const search = ref('')
const filters = ref({
  year: new Date().getFullYear().toString(),
  month: (new Date().getMonth() + 1).toString(),
  vendedor: [],
  stockStatus: null
})

const yearOptions = ['2023', '2024', '2025', '2026']
const monthOptions = [
  { text: 'Enero', value: '1' }, { text: 'Febrero', value: '2' }, { text: 'Marzo', value: '3' },
  { text: 'Abril', value: '4' }, { text: 'Mayo', value: '5' }, { text: 'Junio', value: '6' },
  { text: 'Julio', value: '7' }, { text: 'Agosto', value: '8' }, { text: 'Septiembre', value: '9' },
  { text: 'Octubre', value: '10' }, { text: 'Noviembre', value: '11' }, { text: 'Diciembre', value: '12' }
]

const stockStatusOptions = [
  { text: 'Todos', value: null },
  { text: 'Con stock completo', value: 'full' },
  { text: 'Stock parcial', value: 'partial' },
  { text: 'Sin stock', value: 'none' }
]

const showDetail = ref(false)
const selectedDocNum = ref(null)
const selectedSourceCompany = ref(null)

const openDetail = (item) => {
  selectedDocNum.value = item.Folio
  selectedSourceCompany.value = item.SourceCompany || null
  showDetail.value = true
}

const fetchBacklog = async () => {
  loading.value = true
  try {
    const res = await axios.get('/crm/backlog', {
      params: { year: filters.value.year, month: filters.value.month }
    })
    orders.value = res.data
  } catch (e) { console.error(e) } finally { loading.value = false }
}

// Clasificación de stock por pedido (basado en agregados que vienen del backend)
const stockStatusOf = (o) => {
  if (o.LinesOpen === 0) return 'full'
  if (o.LinesWithStock >= o.LinesOpen) return 'full'
  if (o.LinesWithStock === 0) return 'none'
  return 'partial'
}
const stockColor = status => ({ full: 'success', partial: 'warning', none: 'error' }[status] || 'neutral')
const stockIcon = status => ({ full: 'i-mdi-check-circle', partial: 'i-mdi-alert', none: 'i-mdi-close-circle' }[status] || 'i-mdi-help')
const stockLabel = status => ({ full: 'Completo', partial: 'Parcial', none: 'Sin stock' }[status] || '—')

// Vendedores únicos en la lista
const vendedorOptions = computed(() => [...new Set(orders.value.map(o => o.Vendedor))].sort())

const filteredOrders = computed(() => {
  return orders.value.filter((o) => {
    const matchSearch = !search.value
      || o.Cliente.toLowerCase().includes(search.value.toLowerCase())
      || o.Folio.toString().includes(search.value)
    const matchVendedor = !filters.value.vendedor?.length || filters.value.vendedor.includes(o.Vendedor)
    const matchStock = !filters.value.stockStatus || stockStatusOf(o) === filters.value.stockStatus
    return matchSearch && matchVendedor && matchStock
  })
})

// KPIs
const totalSum = computed(() => filteredOrders.value.reduce((a, o) => a + (o.Monto || 0), 0))
const ordersFullStock = computed(() => filteredOrders.value.filter(o => stockStatusOf(o) === 'full').length)
const ordersPartialStock = computed(() => filteredOrders.value.filter(o => stockStatusOf(o) === 'partial').length)
const ordersNoStock = computed(() => filteredOrders.value.filter(o => stockStatusOf(o) === 'none').length)

const formatCurrency = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const formatDate = d => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—'

// Días para entrega
const daysUntilDue = (date) => {
  if (!date) return null
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((d - t) / (1000 * 60 * 60 * 24))
}
const dueColor = (date) => {
  const d = daysUntilDue(date)
  if (d === null) return 'neutral'
  if (d < 0) return 'error'
  if (d <= 3) return 'warning'
  return 'success'
}

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis en lugar de
// ensanchar la tabla. Mismo criterio que el pipeline.
const headers = [
  { key: 'Folio', title: 'Pedido', w: 'w-[8%]' },
  { key: 'Cliente', title: 'Cliente', w: 'w-[26%]' },
  { key: 'Vendedor', title: 'Vendedor', w: 'w-[14%]' },
  { key: 'Monto', title: 'Monto', align: 'end', w: 'w-[11%]' },
  { key: 'LinesOpen', title: 'Líneas (pend/tot)', align: 'center', w: 'w-[9%]' },
  { key: 'StockStatus', title: 'Stock', w: 'w-[16%]' },
  { key: 'FechaEntrega', title: 'Entrega', align: 'center', w: 'w-[8%]' },
  { key: 'FechaPedido', title: 'Pedido', align: 'center', w: 'w-[8%]' }
]

const columns = headers.map((hdr) => {
  const align = hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
  return {
    id: hdr.key,
    accessorKey: hdr.key,
    header: hdr.title,
    meta: {
      class: {
        // El ancho se declara en el th; con `table-fixed` el td lo hereda.
        th: [hdr.w, 'px-2 truncate', align].filter(Boolean).join(' '),
        // `truncate` recorta con elipsis en vez de ensanchar la columna.
        td: ['px-2 truncate', align].filter(Boolean).join(' ')
      }
    }
  }
})

// Distingue la primera carga (mostramos esqueletos) de las recargas por filtro,
// para que los indicadores no parpadeen al refiltrar.
const cargaInicial = computed(() => loading.value && !orders.value.length)

// Hay filtros si la búsqueda tiene texto o alguna selección está activa.
const hayFiltros = computed(() =>
  !!search.value || !!filters.value.vendedor?.length || !!filters.value.stockStatus
)

const limpiarFiltros = () => {
  search.value = ''
  filters.value.vendedor = []
  filters.value.stockStatus = null
}

onMounted(fetchBacklog)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="crm-backlog" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Backlog de Pedidos" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-mdi-refresh"
            color="primary"
            :loading="loading"
            @click="fetchBacklog"
          >
            Actualizar
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-muted mb-4">
        Pedidos colocados pendientes de entrega (SAP B1 ORDR)
      </p>

      <!-- KPIs -->
      <div class="grid grid-cols-12 gap-4 mb-6">
        <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al filtrar -->
        <template v-if="cargaInicial">
          <UCard
            v-for="(span, i) in [
              'col-span-12 sm:col-span-6 md:col-span-3',
              'col-span-12 sm:col-span-6 md:col-span-3',
              'col-span-12 sm:col-span-6 md:col-span-2',
              'col-span-12 sm:col-span-6 md:col-span-2',
              'col-span-12 sm:col-span-6 md:col-span-2'
            ]"
            :key="`kpi-skel-${i}`"
            :class="span"
          >
            <div class="text-center">
              <USkeleton class="h-3 w-24 mx-auto mb-2" />
              <USkeleton class="h-7 w-20 mx-auto" />
            </div>
          </UCard>
        </template>

        <template v-else>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Pedidos abiertos
              </div>
              <div class="text-2xl font-bold text-primary">
                {{ filteredOrders.length }}
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Monto en Backlog
              </div>
              <div class="text-2xl font-bold text-highlighted">
                {{ formatCurrency(totalSum) }}
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-2">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Stock completo
              </div>
              <div class="text-2xl font-bold text-success">
                {{ ordersFullStock }}
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-2">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Stock parcial
              </div>
              <div class="text-2xl font-bold text-warning">
                {{ ordersPartialStock }}
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-2">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Sin stock
              </div>
              <div class="text-2xl font-bold text-error">
                {{ ordersNoStock }}
              </div>
            </div>
          </UCard>
        </template>
      </div>

      <!-- La tarjeta ocupa el espacio restante y es la única que scrollea por
           dentro: los indicadores y los filtros quedan siempre a la vista. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col', header: 'shrink-0' }"
      >
        <template #header>
          <div class="space-y-3">
            <UInput
              v-model="search"
              icon="i-mdi-magnify"
              placeholder="Búsqueda (Cliente, Folio)"
              class="w-full"
            />

            <USeparator />

            <div class="grid grid-cols-12 gap-3">
              <UFormField label="Año" class="col-span-6 sm:col-span-4 md:col-span-2">
                <USelect
                  v-model="filters.year"
                  :items="yearOptions"
                  class="w-full"
                  @update:model-value="fetchBacklog"
                />
              </UFormField>
              <UFormField label="Mes" class="col-span-6 sm:col-span-4 md:col-span-2">
                <USelect
                  v-model="filters.month"
                  :items="monthOptions"
                  label-key="text"
                  value-key="value"
                  class="w-full"
                  @update:model-value="fetchBacklog"
                />
              </UFormField>
              <UFormField label="Vendedor" class="col-span-12 sm:col-span-4 md:col-span-3">
                <USelectMenu
                  v-model="filters.vendedor"
                  :items="vendedorOptions"
                  multiple
                  icon="i-mdi-account-tie"
                  placeholder="Todos"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Estado de stock" class="col-span-12 sm:col-span-6 md:col-span-3">
                <USelect
                  v-model="filters.stockStatus"
                  :items="stockStatusOptions"
                  label-key="text"
                  value-key="value"
                  icon="i-mdi-package-variant"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </template>

        <UTable
          :data="filteredOrders"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="cursor-pointer flex-1 min-h-0 overflow-y-auto"
          :ui="{
            base: 'table-fixed w-full',
            td: 'text-sm py-2',
            th: 'text-xs py-2'
          }"
          @select="(_e, row) => openDetail(row.original)"
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
                <USkeleton class="h-4 w-14 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-28 shrink-0" />
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
                {{ hayFiltros ? 'Ningún pedido coincide con los filtros' : 'No hay pedidos abiertos' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba quitando algún filtro o ampliando la búsqueda.'
                  : 'No se encontraron pedidos pendientes de entrega en el periodo seleccionado.' }}
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
                @click="fetchBacklog"
              />
            </div>
          </template>

          <template #Folio-cell="{ row }">
            <span class="text-primary font-bold">#{{ row.original.Folio }}</span>
          </template>
          <template #Cliente-cell="{ row }">
            <span class="block truncate font-medium" :title="row.original.Cliente">
              {{ row.original.Cliente }}
            </span>
          </template>
          <template #Vendedor-cell="{ row }">
            <span class="block truncate" :title="row.original.Vendedor">
              {{ row.original.Vendedor }}
            </span>
          </template>
          <template #Monto-cell="{ row }">
            <span class="font-semibold">{{ formatCurrency(row.original.Monto) }}</span>
          </template>
          <template #LinesOpen-cell="{ row }">
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ row.original.LinesOpen }} / {{ row.original.LineCount }}
            </UBadge>
          </template>
          <template #StockStatus-cell="{ row }">
            <UBadge
              :color="stockColor(stockStatusOf(row.original))"
              :icon="stockIcon(stockStatusOf(row.original))"
              variant="subtle"
              size="sm"
              class="font-semibold"
            >
              {{ stockLabel(stockStatusOf(row.original)) }}
              ({{ row.original.LinesWithStock }}/{{ row.original.LinesOpen }})
            </UBadge>
          </template>
          <template #FechaEntrega-cell="{ row }">
            <UBadge
              :color="dueColor(row.original.FechaEntrega)"
              variant="subtle"
              size="sm"
              icon="i-mdi-calendar"
            >
              {{ formatDate(row.original.FechaEntrega) }}
            </UBadge>
          </template>
          <template #FechaPedido-cell="{ row }">
            <span class="text-xs text-muted">{{ formatDate(row.original.FechaPedido) }}</span>
          </template>
        </UTable>
      </UCard>

      <BacklogDetailDialog
        v-model="showDetail"
        :doc-num="selectedDocNum"
        :source-company="selectedSourceCompany"
      />
    </template>
  </UDashboardPanel>
</template>
