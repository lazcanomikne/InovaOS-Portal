<script setup>
import { ref, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import axios from '~/utils/axios'
import { useCompanyStore } from '~/stores/company'

const props = defineProps({
  modelValue: Boolean,
  kpi: String,          // pipeline | backlog | revenue | utilidad | hitrate
  title: String,        // etiqueta legible (Pipeline, Revenue…)
  filters: Object       // { year, month, slpName, tipo }
})
const emit = defineEmits(['update:modelValue'])

const internalModel = ref(props.modelValue)
const loading = ref(false)
const rows = ref([])
const companyStore = useCompanyStore()

// Columnas por KPI. `money` formatea moneda, `date` fecha, `total` se suma en el pie.
const COLS = {
  pipeline: [
    { key: 'Empresa', label: 'Empresa', empresa: true },
    { key: 'Documento', label: 'Cotización' },
    { key: 'Cliente', label: 'Cliente' },
    { key: 'Vendedor', label: 'Vendedor' },
    { key: 'Fecha', label: 'Fecha', date: true },
    { key: 'Etapa', label: 'Etapa' },
    { key: 'Oportunidad', label: 'Opp.' },
    { key: 'Monto', label: 'Monto', money: true, total: true }
  ],
  backlog: [
    { key: 'Empresa', label: 'Empresa', empresa: true },
    { key: 'Documento', label: 'Orden' },
    { key: 'Cliente', label: 'Cliente' },
    { key: 'Vendedor', label: 'Vendedor' },
    { key: 'Fecha', label: 'Fecha', date: true },
    { key: 'Monto', label: 'Monto', money: true, total: true }
  ],
  revenue: [
    { key: 'Empresa', label: 'Empresa', empresa: true },
    { key: 'Tipo', label: 'Tipo' },
    { key: 'Documento', label: 'Documento' },
    { key: 'Cliente', label: 'Cliente' },
    { key: 'Vendedor', label: 'Vendedor' },
    { key: 'Fecha', label: 'Fecha', date: true },
    { key: 'Monto', label: 'Venta neta', money: true, total: true }
  ],
  utilidad: [
    { key: 'Empresa', label: 'Empresa', empresa: true },
    { key: 'Tipo', label: 'Tipo' },
    { key: 'Documento', label: 'Documento' },
    { key: 'Cliente', label: 'Cliente' },
    { key: 'Vendedor', label: 'Vendedor' },
    { key: 'Fecha', label: 'Fecha', date: true },
    { key: 'Monto', label: 'Venta neta', money: true, total: true },
    { key: 'Utilidad', label: 'Utilidad', money: true, total: true },
    { key: 'Margen', label: '% Margen', pct: true }
  ],
  hitrate: [
    { key: 'Empresa', label: 'Empresa', empresa: true },
    { key: 'Documento', label: 'Cotización' },
    { key: 'Cliente', label: 'Cliente' },
    { key: 'Vendedor', label: 'Vendedor' },
    { key: 'Fecha', label: 'Fecha', date: true },
    { key: 'Convertida', label: 'Convertida' },
    { key: 'Oportunidad', label: 'Opp.' },
    { key: 'Monto', label: 'Monto', money: true, total: true }
  ]
}

const columns = computed(() => COLS[props.kpi] || COLS.revenue)

// Orden y filtros por columna (a nivel tabla).
const sort = ref({ key: null, dir: 1 }) // dir: 1 asc, -1 desc
const colFilters = ref({})
const ordenarPor = (col) => {
  sort.value = sort.value.key === col.key
    ? { key: col.key, dir: -sort.value.dir }
    : { key: col.key, dir: 1 }
}

watch(() => props.modelValue, (v) => {
  internalModel.value = v
  if (v && props.kpi) cargar()
})
watch(internalModel, (v) => emit('update:modelValue', v))

const cargar = async () => {
  loading.value = true
  rows.value = []
  sort.value = { key: null, dir: 1 }
  colFilters.value = {}
  try {
    const r = await axios.get('/crm/dashboard/kpi-detail', {
      params: {
        kpi: props.kpi,
        year: props.filters?.year,
        month: props.filters?.month,
        slpName: props.filters?.slpName,
        tipo: props.filters?.tipo
      }
    })
    rows.value = r.data || []
  } catch (e) {
    console.error('Error cargando desglose:', e)
  } finally {
    loading.value = false
  }
}

const empresaLabel = (id) => companyStore.companies.find(c => c.id === id)?.label || id
const money = (v) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(v) || 0)
const fecha = (v) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-').map(Number)
  if (!a) return '—'
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
}
// Margen por línea = Utilidad / Venta neta (con las columnas que ya trae la fila).
const margenNum = (row) => {
  const v = Number(row.Monto)
  return v ? (Number(row.Utilidad) / v) * 100 : 0
}
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`

const cell = (row, col) => {
  const v = row[col.key]
  if (col.empresa) return empresaLabel(v)
  if (col.pct) return pct(margenNum(row))
  if (col.money) return money(v)
  if (col.date) return fecha(v)
  return v ?? '—'
}

// Valor comparable para ordenar; texto para filtrar (incluye lo mostrado y el
// valor crudo, para que filtren tanto por "$50,000" como por "50000").
const valorOrden = (row, col) => {
  if (col.pct) return margenNum(row)
  if (col.money) return Number(row[col.key]) || 0
  if (col.empresa) return empresaLabel(row[col.key])
  if (col.date) return String(row[col.key] || '').slice(0, 10)
  return String(row[col.key] ?? '')
}
const textoBusqueda = (row, col) => {
  const raw = col.pct ? margenNum(row).toFixed(1) : row[col.key]
  return `${cell(row, col)} ${raw ?? ''}`.toLowerCase()
}

const filasFiltradas = computed(() => {
  const activos = Object.entries(colFilters.value).filter(([, v]) => String(v || '').trim())
  if (!activos.length) return rows.value
  return rows.value.filter(row => activos.every(([k, v]) => {
    const col = columns.value.find(c => c.key === k)
    return col ? textoBusqueda(row, col).includes(String(v).toLowerCase().trim()) : true
  }))
})

const filasVista = computed(() => {
  const arr = [...filasFiltradas.value]
  const s = sort.value
  if (!s.key) return arr
  const col = columns.value.find(c => c.key === s.key)
  if (!col) return arr
  const numerica = col.money || col.pct
  arr.sort((a, b) => {
    const va = valorOrden(a, col), vb = valorOrden(b, col)
    return (numerica ? (va - vb) : String(va).localeCompare(String(vb), 'es')) * s.dir
  })
  return arr
})

// Totales sobre lo FILTRADO (para que el pie refleje lo que se ve).
const totales = computed(() => {
  const t = {}
  for (const col of columns.value) {
    if (col.total) t[col.key] = filasFiltradas.value.reduce((a, r) => a + (Number(r[col.key]) || 0), 0)
  }
  return t
})

// Margen global del desglose (para el pie del % Margen).
const margenTotal = computed(() => totales.value.Monto ? (totales.value.Utilidad / totales.value.Monto) * 100 : 0)

const close = () => { internalModel.value = false }

const exportarExcel = () => {
  const data = filasVista.value.map(r => {
    const o = {}
    for (const col of columns.value) {
      o[col.label] = col.empresa ? empresaLabel(r[col.key])
        : col.pct ? +margenNum(r).toFixed(1)
          : col.date ? fecha(r[col.key])
            : col.money ? Number(r[col.key]) || 0
              : (r[col.key] ?? '')
    }
    return o
  })
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = columns.value.map(c => ({ wch: c.key === 'Cliente' ? 34 : c.money ? 15 : 14 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, (props.title || 'KPI').slice(0, 28))
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `desglose_${props.kpi}_${stamp}.xlsx`)
}
</script>

<template>
  <UModal v-model:open="internalModel" fullscreen :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-2 w-full">
        <UButton icon="i-mdi-close" color="neutral" variant="ghost" @click="close" />
        <span class="font-semibold text-highlighted">Desglose · {{ title }}</span>
        <UBadge color="primary" variant="subtle">{{ filasFiltradas.length }} operaciones</UBadge>
        <div class="flex-1" />
        <UButton
          color="success"
          variant="soft"
          icon="i-mdi-file-excel"
          :disabled="!rows.length"
          @click="exportarExcel"
        >
          Exportar a Excel
        </UButton>
      </div>
    </template>

    <template #body>
      <div v-if="loading" class="flex justify-center items-center" style="min-height: 70vh;">
        <UIcon name="i-lucide-loader-circle" class="animate-spin size-14 text-primary" />
      </div>

      <div v-else class="p-4 sm:p-6">
        <p class="text-sm text-muted mb-3">
          Operaciones que componen el monto de <b class="text-highlighted">{{ title }}</b> con los filtros del tablero.
        </p>

        <div v-if="!rows.length" class="text-center py-16 text-dimmed">
          No hay operaciones para este KPI en el periodo seleccionado.
        </div>

        <div v-else class="border border-default rounded-lg overflow-auto" style="max-height: calc(100vh - 220px);">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-elevated z-10">
              <!-- Encabezados: clic para ordenar -->
              <tr>
                <th
                  v-for="col in columns"
                  :key="col.key"
                  class="px-3 pt-2 pb-1 text-xs uppercase tracking-wide font-bold text-muted whitespace-nowrap cursor-pointer select-none hover:text-highlighted"
                  @click="ordenarPor(col)"
                >
                  <span class="inline-flex items-center gap-1" :class="(col.money || col.pct) ? 'w-full justify-end' : ''">
                    {{ col.label }}
                    <UIcon
                      :name="sort.key === col.key ? (sort.dir === 1 ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-chevrons-up-down'"
                      class="size-3"
                      :class="sort.key === col.key ? 'text-primary' : 'opacity-40'"
                    />
                  </span>
                </th>
              </tr>
              <!-- Filtro por columna -->
              <tr>
                <th
                  v-for="col in columns"
                  :key="`f-${col.key}`"
                  class="px-2 pb-2 border-b border-default"
                >
                  <input
                    v-model="colFilters[col.key]"
                    type="text"
                    placeholder="Filtrar…"
                    class="w-full text-xs font-normal normal-case px-2 py-1 rounded-md border border-default bg-default text-highlighted outline-none focus:border-primary"
                    @click.stop
                  >
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in filasVista"
                :key="i"
                class="border-b border-default/60 hover:bg-elevated/40"
              >
                <td
                  v-for="col in columns"
                  :key="col.key"
                  class="px-3 py-2 whitespace-nowrap"
                  :class="[
                    col.money ? 'text-right font-semibold tabular-nums' : '',
                    col.pct ? 'text-right tabular-nums text-muted' : '',
                    col.money && Number(row[col.key]) < 0 ? 'text-error' : '',
                    col.key === 'Convertida' ? (row.Convertida === 'Sí' ? 'text-success font-bold' : 'text-muted') : ''
                  ]"
                >
                  <template v-if="col.key === 'Cliente'">
                    <span class="block max-w-[280px] truncate" :title="row.Cliente">{{ row.Cliente }}</span>
                  </template>
                  <template v-else>
                    {{ cell(row, col) }}
                  </template>
                </td>
              </tr>
              <tr v-if="!filasVista.length">
                <td :colspan="columns.length" class="text-center py-8 text-dimmed">
                  Ningún resultado con los filtros aplicados.
                </td>
              </tr>
            </tbody>
            <tfoot class="sticky bottom-0 bg-elevated">
              <tr class="border-t-2 border-default font-bold">
                <td
                  v-for="(col, idx) in columns"
                  :key="col.key"
                  class="px-3 py-2 whitespace-nowrap"
                  :class="(col.money || col.pct) ? 'text-right tabular-nums' : ''"
                >
                  <template v-if="idx === 0">Total ({{ filasFiltradas.length }})</template>
                  <template v-else-if="col.pct">{{ pct(margenTotal) }}</template>
                  <template v-else-if="col.total">{{ money(totales[col.key]) }}</template>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </template>
  </UModal>
</template>
