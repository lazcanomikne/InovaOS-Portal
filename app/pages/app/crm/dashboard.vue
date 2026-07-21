<script setup>
import axios from '~/utils/axios'

// Chart.js Imports
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const toast = useToast()
const loading = ref(false)
const errorCarga = ref('')

const filters = ref({
  year: new Date().getFullYear().toString(),
  month: (new Date().getMonth() + 1).toString(), // Mes actual por defecto
  slpName: 'Todos',
  tipo: 'Todos'
})

const vendedorOptions = ref([])

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

// KPIs. Paleta de marca igual que el pipeline: el azul #0096D5 se va
// intensificando a lo largo del embudo (Pipeline -> Backlog -> Revenue) y el
// gris #2C3038 marca los indicadores derivados. Los colores semánticos
// (success/warning/error) quedan reservados para estados, no para categorías.
// Las clases van literales porque Tailwind no detecta las interpoladas.
const kpis = ref([
  {
    title: 'Pipeline',
    value: '$0',
    secondary: '',
    subtitle: 'Oportunidades activas (no cerradas)',
    icon: 'mdi-filter-variant',
    borde: 'border-t-primary-300 dark:border-t-primary-400',
    texto: 'text-primary-500 dark:text-primary-300'
  },
  {
    title: 'Backlog',
    value: '$0',
    secondary: '',
    subtitle: 'Órdenes colocadas por facturar',
    icon: 'mdi-truck-fast-outline',
    borde: 'border-t-primary-400',
    texto: 'text-primary-500 dark:text-primary-400'
  },
  {
    title: 'Revenue',
    value: '$0',
    secondary: '',
    subtitle: 'Venta real facturada (sin IVA, neta de NC)',
    icon: 'mdi-cash-check',
    borde: 'border-t-primary',
    texto: 'text-primary'
  },
  {
    title: 'Utilidad',
    value: '$0',
    secondary: '0%',
    subtitle: 'Margen sobre venta real',
    icon: 'mdi-chart-areaspline',
    borde: 'border-t-ink-800 dark:border-t-ink-300',
    texto: 'text-ink-800 dark:text-ink-200'
  },
  {
    title: 'Hit Rate',
    value: '0%',
    secondary: '',
    subtitle: 'Convertido a OV / total cotizado del periodo',
    icon: 'mdi-target',
    borde: 'border-t-ink-600 dark:border-t-ink-400',
    texto: 'text-ink-700 dark:text-ink-300'
  }
])

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100)
}

const monthlyData = ref([])

// chart.js pinta sobre un canvas, así que necesita valores de color reales y no
// acepta clases de Tailwind. Los tokens se leen de la hoja de estilos en tiempo
// de ejecución para no duplicar aquí los hex de la paleta: si la paleta cambia
// (o cambia el tema), la gráfica sigue el cambio sin tocar este archivo.
// Cada serie es una CATEGORÍA de dato, no un estado, por eso usa la paleta
// categórica de marca (--color-cat-N) en vez de success/warning/error.
const TOKENS_SERIES = {
  revenue: '--color-cat-1',
  utilidad: '--color-cat-2',
  pipeline: '--color-cat-8',
  backlog: '--color-cat-3',
  hitRate: '--color-cat-6'
}

// Se resuelven al montar, cuando ya existe `document` y el tema está aplicado.
const coloresSerie = ref({})

const resolverColoresSerie = () => {
  const estilos = getComputedStyle(document.documentElement)
  coloresSerie.value = Object.fromEntries(
    Object.entries(TOKENS_SERIES).map(([serie, token]) => [serie, estilos.getPropertyValue(token).trim()])
  )
}

const chartData = computed(() => ({
  labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  datasets: [
    {
      label: 'Revenue',
      data: monthlyData.value.map(d => d.revenue),
      borderColor: coloresSerie.value.revenue,
      backgroundColor: coloresSerie.value.revenue,
      yAxisID: 'y',
      tension: 0.3
    },
    {
      label: 'Utilidad',
      data: monthlyData.value.map(d => d.utilidad),
      borderColor: coloresSerie.value.utilidad,
      backgroundColor: coloresSerie.value.utilidad,
      yAxisID: 'y',
      tension: 0.3
    },
    {
      label: 'Pipeline',
      data: monthlyData.value.map(d => d.pipeline),
      borderColor: coloresSerie.value.pipeline,
      backgroundColor: coloresSerie.value.pipeline,
      borderDash: [5, 4],
      yAxisID: 'y',
      tension: 0.3
    },
    {
      label: 'Backlog',
      data: monthlyData.value.map(d => d.backlog),
      borderColor: coloresSerie.value.backlog,
      backgroundColor: coloresSerie.value.backlog,
      borderDash: [5, 4],
      yAxisID: 'y',
      tension: 0.3
    },
    {
      label: 'Hit Rate %',
      data: monthlyData.value.map(d => d.hitRate),
      borderColor: coloresSerie.value.hitRate,
      backgroundColor: coloresSerie.value.hitRate,
      yAxisID: 'y1',
      tension: 0.3
    }
  ]
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  scales: {
    y: {
      type: 'linear',
      display: true,
      position: 'left',
      title: { display: true, text: 'Monto (MXN)' },
      ticks: {
        callback: value => '$' + value.toLocaleString()
      }
    },
    y1: {
      type: 'linear',
      display: true,
      position: 'right',
      grid: { drawOnChartArea: false },
      title: { display: true, text: 'Hit Rate %' },
      min: 0,
      max: 100,
      ticks: { callback: value => value + '%' }
    }
  },
  plugins: {
    legend: { position: 'bottom' },
    tooltip: {
      callbacks: {
        label: (context) => {
          let label = context.dataset.label || ''
          if (label) label += ': '
          if (context.dataset.yAxisID === 'y') {
            label += new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(context.parsed.y)
          } else {
            label += context.parsed.y.toFixed(1) + '%'
          }
          return label
        }
      }
    }
  }
}

const fetchKPIs = async () => {
  loading.value = true
  errorCarga.value = ''
  try {
    const params = {
      year: filters.value.year,
      month: filters.value.month,
      slpName: filters.value.slpName,
      tipo: filters.value.tipo
    }

    const [kpiRes, statsRes] = await Promise.all([
      axios.get('/crm/dashboard/kpis', { params }),
      axios.get('/crm/dashboard/monthly-stats', { params: { ...params } })
    ])

    const data = kpiRes.data
    // 0 Pipeline, 1 Backlog, 2 Revenue, 3 Utilidad, 4 Hit Rate
    kpis.value[0].value = formatCurrency(data.pipeline)
    kpis.value[1].value = formatCurrency(data.backlog)
    kpis.value[2].value = formatCurrency(data.revenue)
    kpis.value[3].value = formatCurrency(data.utilidadMonto)
    kpis.value[3].secondary = `${data.utilidadPorc.toFixed(1)}% margen`
    kpis.value[4].value = formatPercent(data.hitRate)
    kpis.value[4].secondary = `${formatCurrency(data.montoConvertido)} de ${formatCurrency(data.montoCotizado)} cotizado`

    monthlyData.value = statsRes.data

    const periodoStr = filters.value.month
      ? `${monthOptions.find(m => m.value === filters.value.month).text} ${filters.value.year}`
      : `Todo ${filters.value.year}`
    kpis.value[2].subtitle = `Venta real · ${periodoStr}`
  } catch (error) {
    console.error('Error al cargar datos del dashboard:', error)
    // El original sólo escribía en consola y la pantalla quedaba en $0 sin
    // explicación. Ahora el fallo es visible para el usuario.
    errorCarga.value = error?.response?.data?.message
      || error?.message
      || 'No se pudieron cargar los datos.'
    toast.add({
      title: 'Error al cargar el tablero',
      description: errorCarga.value,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

const fetchSalespeople = async () => {
  try {
    const response = await axios.get('/crm/salespeople')
    // El endpoint devuelve [{id, name}] (consolidado multi-empresa); usamos nombres
    vendedorOptions.value = response.data.map(v => v.name || v)
  } catch (error) {
    console.error('Error al cargar vendedores:', error)
  }
}

onMounted(async () => {
  resolverColoresSerie()
  await fetchSalespeople()
  await fetchKPIs()
})
</script>

<template>
  <UDashboardPanel id="crm-dashboard">
    <template #header>
      <UDashboardNavbar title="Tablero de Control Comercial">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="primary"
            icon="i-mdi-refresh"
            label="Actualizar"
            :loading="loading"
            @click="fetchKPIs"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mb-4">
        <p class="text-muted">
          Resumen de KPIs y desempeño
        </p>
      </div>

      <UAlert
        v-if="errorCarga"
        icon="i-mdi-alert-circle-outline"
        color="error"
        variant="subtle"
        title="No se pudieron cargar los datos"
        :description="errorCarga"
        class="mb-4"
      />

      <!-- Barra de filtros -->
      <UCard class="mb-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <UFormField label="Año">
            <USelect
              v-model="filters.year"
              :items="yearOptions"
              class="w-full"
              @update:model-value="fetchKPIs"
            />
          </UFormField>

          <UFormField label="Mes">
            <USelect
              v-model="filters.month"
              :items="monthOptions"
              label-key="text"
              value-key="value"
              class="w-full"
              @update:model-value="fetchKPIs"
            />
          </UFormField>

          <UFormField label="Tipo de Venta">
            <USelect
              v-model="filters.tipo"
              :items="['Todos', 'Transaccional', 'Proyecto']"
              class="w-full"
              @update:model-value="fetchKPIs"
            />
          </UFormField>

          <UFormField label="Vendedor">
            <USelectMenu
              v-model="filters.slpName"
              :items="['Todos', ...vendedorOptions]"
              class="w-full"
              @update:model-value="fetchKPIs"
            />
          </UFormField>
        </div>
      </UCard>

      <!-- KPIs: embudo comercial Pipeline -> Backlog -> Revenue + Utilidad + Hit Rate -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <UCard
          v-for="(kpi, index) in kpis"
          :key="index"
          class="border-t-[3px] h-full"
          :class="kpi.borde"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs uppercase tracking-wide font-bold text-muted">{{ kpi.title }}</span>
            <UIcon
              :name="`i-${kpi.icon}`"
              class="size-5 shrink-0"
              :class="kpi.texto"
            />
          </div>
          <h3 class="text-xl font-bold text-highlighted">
            {{ kpi.value }}
          </h3>
          <div
            v-if="kpi.secondary"
            class="text-sm font-bold"
            :class="kpi.texto"
          >
            {{ kpi.secondary }}
          </div>
          <div class="mt-1 text-xs text-muted">
            {{ kpi.subtitle }}
          </div>
        </UCard>
      </div>

      <!-- Gráfica -->
      <UCard class="mt-4">
        <template #header>
          <div class="flex items-center">
            <span class="font-semibold text-highlighted">Avance Mensual</span>
            <div class="flex-1" />
            <UButton
              variant="ghost"
              size="sm"
              color="primary"
              label="Ver Detalle"
            />
          </div>
        </template>

        <!-- chart.js depende del DOM: sólo se monta en cliente -->
        <ClientOnly>
          <div class="h-[350px]">
            <Line :data="chartData" :options="chartOptions" />
          </div>

          <template #fallback>
            <div class="h-[350px] flex items-center justify-center">
              <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
            </div>
          </template>
        </ClientOnly>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
