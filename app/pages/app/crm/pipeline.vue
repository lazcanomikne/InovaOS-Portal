<script setup>
import { h, resolveComponent } from 'vue'
import axios from '~/utils/axios'
import { stageOptions } from '~/config/crmStages'
import QuoteDetailDialog from '~/components/crm/QuoteDetailDialog.vue'
import CustomerQuotesDialog from '~/components/crm/CustomerQuotesDialog.vue'

const UButton = resolveComponent('UButton')

const router = useRouter()
const toast = useToast()
const loading = ref(false)
const errorCarga = ref('')

// Distingue la primera carga (mostramos esqueletos) de las recargas por filtro
// (mantenemos los datos visibles para que la pantalla no parpadee).
const cargaInicial = computed(() => loading.value && !pipeline.value.length)

// Color estable por oportunidad para identificar de un vistazo qué cotizaciones
// están agrupadas entre sí (mismo color = misma oportunidad).
// Usa la paleta categórica de marca definida en assets/css/main.css, en lugar
// de los colores de Material que venían del portal Vuetify.
const TOTAL_CATEGORIAS = 8
const oppHex = id => `var(--color-cat-${(Math.abs(Number(id)) % TOTAL_CATEGORIAS) + 1})`
const goToOpportunity = id => router.push(`/app/crm/opportunities/${id}`)

// Adaptador de presentación: nombres de color Vuetify -> colores semánticos Nuxt UI.
const badgeColor = c => ({ orange: 'warning', grey: 'neutral', teal: 'info', purple: 'primary' })[c] || c

const pipeline = ref([])
// Todos los filtros de catálogo son multi-selección. Un arreglo vacío significa
// "sin filtro" (equivale a Todos), así que siempre existe la opción de no
// seleccionar nada. `month` vacío = el año completo.
const filters = ref({
  cliente: '',
  vendedor: [],
  etapa: [],
  tipo: [],
  year: new Date().getFullYear().toString(),
  month: [(new Date().getMonth() + 1).toString()], // Arranca en el mes actual
  propietario: []
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

const showQuoteDialog = ref(false)
const showHistoryDialog = ref(false)
const selectedFolio = ref(null)
const selectedItem = ref(null)
const selectedCardCode = ref('')
const selectedCustomerName = ref('')

const handleOpenHistory = (data) => {
  selectedCardCode.value = data.cardCode
  selectedCustomerName.value = data.customerName
  showHistoryDialog.value = true
}

const handleOpenQuote = (folio) => {
  selectedFolio.value = folio
  showQuoteDialog.value = true
}

// Filtros dinámicos basados en la data cargada
const vendedorOptions = computed(() => {
  const list = pipeline.value.map(item => item.Vendedor)
  return [...new Set(list)].sort()
})

const propietarioOptions = computed(() => {
  const list = pipeline.value.map(item => item.Propietario).filter(p => !!p)
  return [...new Set(list)].sort()
})

// Lógica de filtrado combinada
const filteredPipeline = computed(() => {
  return pipeline.value.filter((item) => {
    const matchCliente = !filters.value.cliente
      || item.Cliente.toLowerCase().includes(filters.value.cliente.toLowerCase())
      || item.Folio.toString().includes(filters.value.cliente)

    // Arreglo vacío = sin filtro, así que "no seleccionar nada" muestra todo.
    const matchVendedor = !filters.value.vendedor?.length || filters.value.vendedor.includes(item.Vendedor)
    const matchEtapa = !filters.value.etapa?.length || filters.value.etapa.includes(item.Etapa)
    const matchTipo = !filters.value.tipo?.length || filters.value.tipo.includes(item.Tipo)
    const matchPropietario = !filters.value.propietario?.length || filters.value.propietario.includes(item.Propietario)

    return matchCliente && matchVendedor && matchEtapa && matchTipo && matchPropietario
  })
})

// KPIs Calculados (Reactivos a los filtros)
// Monto Total: las cotizaciones agrupadas en una oportunidad NO se suman
// individualmente; cuentan UNA vez por su valor de oportunidad (promedio,
// que el backend ya calcula con todas las cotizaciones activas del grupo).
const totalSum = computed(() => {
  const seenOpps = new Set()
  let total = 0
  for (const item of filteredPipeline.value) {
    if (item.OpportunityID) {
      if (!seenOpps.has(item.OpportunityID)) {
        seenOpps.add(item.OpportunityID)
        total += (item.OpportunityValue != null ? item.OpportunityValue : item.Monto)
      }
      // cotizaciones siguientes del mismo grupo no suman
    } else {
      total += item.Monto
    }
  }
  return total
})

const totalClients = computed(() => {
  const clients = filteredPipeline.value.map(item => item.Cliente.split(' - ')[0])
  return [...new Set(clients)].length
})

const sumTransactional = computed(() =>
  filteredPipeline.value.filter(i => i.Tipo === 'Transaccional').reduce((acc, i) => acc + i.Monto, 0)
)
const countTransactional = computed(() => filteredPipeline.value.filter(i => i.Tipo === 'Transaccional').length)

const sumProject = computed(() =>
  filteredPipeline.value.filter(i => i.Tipo === 'Proyecto').reduce((acc, i) => acc + i.Monto, 0)
)
const countProject = computed(() => filteredPipeline.value.filter(i => i.Tipo === 'Proyecto').length)

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el contenido largo se recorta con elipsis en vez de
// ensanchar la tabla. Si el usuario oculta columnas, el navegador reparte el
// sobrante proporcionalmente, así que siempre se ocupa el ancho completo sin
// scroll horizontal.
const allHeaders = [
  { title: 'Folio', key: 'Folio', align: 'start', mandatory: true, w: 'w-[6%]' },
  { title: 'Tipo', key: 'Tipo', align: 'start', w: 'w-[7%]' },
  { title: 'Sentimiento', key: 'Sentimiento', align: 'start', w: 'w-[9%]' },
  { title: 'Cliente', key: 'Cliente', align: 'start', mandatory: true, w: 'w-[17%]' },
  { title: 'Monto', key: 'Monto', align: 'end', w: 'w-[9%]' },
  { title: 'Opp.', key: 'OpportunityName', align: 'center', sortable: false, w: 'w-[5%]' },
  { title: 'Etapa', key: 'Etapa', align: 'start', w: 'w-[10%]' },
  { title: 'Última Acción', key: 'UltimaAccion', align: 'start', w: 'w-[12%]' },
  { title: 'Vendedor', key: 'Vendedor', align: 'start', w: 'w-[9%]' },
  { title: 'Propietario', key: 'Propietario', align: 'start', w: 'w-[8%]' },
  { title: 'Fecha', key: 'FechaContabilizacion', align: 'start', w: 'w-[7%]' },
  { title: 'Acciones', key: 'actions', align: 'end', sortable: false, mandatory: true, w: 'w-[6%]' }
]

const defaultOrder = allHeaders.map(h => h.key)
const columnOrder = ref([...defaultOrder])
const hiddenColumns = ref([])
const draggingIndex = ref(null)

const headerByKey = computed(() => Object.fromEntries(allHeaders.map(h => [h.key, h])))

const isMandatory = key => !!headerByKey.value[key]?.mandatory
const getHeaderTitle = key => headerByKey.value[key]?.title || key

const headers = computed(() => {
  return columnOrder.value
    .filter(k => !hiddenColumns.value.includes(k) || isMandatory(k))
    .map(k => headerByKey.value[k])
    .filter(Boolean)
})

// Traducción de los headers de v-data-table a columnas TanStack para UTable.
// El header sortable se renderiza como botón (v-data-table lo traía de fábrica).
const sorting = ref([])

const columns = computed(() => headers.value.map((hdr) => {
  const sortable = hdr.sortable !== false
  return {
    id: hdr.key,
    accessorKey: hdr.key,
    enableSorting: sortable,
    meta: {
      class: {
        // El ancho se declara en el th; con `table-fixed` el td lo hereda.
        th: [
          hdr.w,
          'px-2',
          hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
        ].filter(Boolean).join(' '),
        // `truncate` recorta con elipsis en lugar de ensanchar la columna.
        td: [
          'px-2 truncate',
          hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
        ].filter(Boolean).join(' ')
      }
    },
    header: sortable
      // Encabezado compacto: en columnas angostas el título se recorta y el
      // icono de orden nunca se sale ni fuerza scroll horizontal.
      ? ({ column }) => h(UButton, {
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
      : hdr.title
  }
}))

// Persistencia preferencia de columnas
let savePrefsTimer = null
const savePrefs = () => {
  clearTimeout(savePrefsTimer)
  savePrefsTimer = setTimeout(async () => {
    try {
      await axios.put('/preferences/pipeline_columns', {
        value: { order: columnOrder.value, hidden: hiddenColumns.value }
      })
    } catch (e) { console.error('Error guardando preferencia de columnas', e) }
  }, 400)
}

const loadPrefs = async () => {
  try {
    const res = await axios.get('/preferences/pipeline_columns')
    const v = res.data?.value
    if (v && Array.isArray(v.order)) {
      // Filtrar columnas obsoletas y agregar nuevas al final
      const validKeys = new Set(defaultOrder)
      const ordered = v.order.filter(k => validKeys.has(k))
      const missing = defaultOrder.filter(k => !ordered.includes(k))
      columnOrder.value = [...ordered, ...missing]
      hiddenColumns.value = Array.isArray(v.hidden)
        ? v.hidden.filter(k => validKeys.has(k) && !isMandatory(k))
        : []
    }
  } catch (e) { /* sin preferencia guardada, usa default */ }
}

const resetColumnPrefs = async () => {
  columnOrder.value = [...defaultOrder]
  hiddenColumns.value = []
  try {
    await axios.delete('/preferences/pipeline_columns')
  } catch (e) { console.error(e) }
}

const toggleColumnVisibility = (key, visible) => {
  if (isMandatory(key)) return
  if (visible) {
    hiddenColumns.value = hiddenColumns.value.filter(k => k !== key)
  } else if (!hiddenColumns.value.includes(key)) {
    hiddenColumns.value = [...hiddenColumns.value, key]
  }
  savePrefs()
}

const onDragStart = (idx, e) => {
  draggingIndex.value = idx
  e.dataTransfer.effectAllowed = 'move'
}

const onDragOver = (idx, e) => {
  e.dataTransfer.dropEffect = 'move'
}

const onDrop = (targetIdx) => {
  if (draggingIndex.value === null || draggingIndex.value === targetIdx) return
  const arr = [...columnOrder.value]
  const [moved] = arr.splice(draggingIndex.value, 1)
  arr.splice(targetIdx, 0, moved)
  columnOrder.value = arr
  savePrefs()
}

const onDragEnd = () => { draggingIndex.value = null }

// El endpoint acepta un solo mes por llamada. Como el filtro ahora permite
// varios meses (o ninguno = año completo), se piden en paralelo y se unen.
// Sin mes seleccionado se traen los 12, que es lo que faltaba antes: la vista
// sólo cargaba el mes en curso y parecía que faltaban datos hacia abajo.
const fetchPipeline = async () => {
  loading.value = true
  errorCarga.value = ''
  try {
    const meses = filters.value.month?.length
      ? filters.value.month
      : monthOptions.map(m => m.value)

    const respuestas = await Promise.all(
      meses.map(m => axios.get('/crm/pipeline', {
        params: { year: filters.value.year, month: m }
      }))
    )

    // Un mismo folio no debería repetirse entre meses, pero deduplicamos por
    // seguridad para no inflar los totales de los indicadores.
    const vistos = new Set()
    pipeline.value = respuestas
      .flatMap(r => r.data || [])
      .filter((item) => {
        if (vistos.has(item.Folio)) return false
        vistos.add(item.Folio)
        return true
      })
  } catch (error) {
    console.error('Error al cargar pipeline:', error)
    errorCarga.value = error?.response?.data?.message
      || error?.message
      || 'No se pudo cargar el pipeline.'
    toast.add({
      title: 'Error al cargar el pipeline',
      description: errorCarga.value,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

const openQuoteDialog = (item) => {
  selectedItem.value = item
  selectedFolio.value = item.Folio
  showQuoteDialog.value = true
}

const onItemUpdated = (updated) => {
  const idx = pipeline.value.findIndex(p => p.Folio === updated.Folio)
  if (idx !== -1) {
    pipeline.value[idx] = { ...pipeline.value[idx], ...updated }
    selectedItem.value = pipeline.value[idx]
  }
}

const formatCurrency = (value, currency) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN'
  }).format(value)
}

const formatDateShort = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

const getStageColor = (stage) => {
  if (stage.includes('Perdida')) return 'text-error'
  if (stage.includes('Colocado')) return 'text-success'
  if (stage.includes('Aprobado')) return 'text-primary'
  return 'text-info'
}

const getSentimentColor = (sentiment) => {
  switch (sentiment) {
    case 'Caliente': return 'error'
    case 'Tibio': return 'orange'
    case 'Frio': return 'info'
    default: return 'grey'
  }
}

// --- Chips de filtros activos ---
const etiquetaMes = valor => monthOptions.find(m => m.value === valor)?.text || valor

// Un chip por cada valor seleccionado, de cualquier filtro.
const filtrosActivos = computed(() => {
  const chips = []
  const agregar = (campo, valores, etiqueta = v => v) => {
    (valores || []).forEach(v => chips.push({ campo, valor: v, texto: etiqueta(v) }))
  }
  agregar('month', filters.value.month, etiquetaMes)
  agregar('vendedor', filters.value.vendedor)
  agregar('etapa', filters.value.etapa)
  agregar('tipo', filters.value.tipo)
  agregar('propietario', filters.value.propietario)
  return chips
})

// Hay filtros si alguna selección está activa o hay texto en la búsqueda.
const hayFiltros = computed(() => filtrosActivos.value.length > 0 || !!filters.value.cliente)

const quitarFiltro = (campo, valor) => {
  filters.value[campo] = filters.value[campo].filter(v => v !== valor)
  // El mes cambia lo que se pide al backend, no sólo el filtrado local.
  if (campo === 'month') fetchPipeline()
}

const limpiarFiltros = () => {
  const teniaMes = filters.value.month.length > 0
  filters.value.cliente = ''
  filters.value.vendedor = []
  filters.value.etapa = []
  filters.value.tipo = []
  filters.value.propietario = []
  filters.value.month = []
  if (teniaMes) fetchPipeline()
}

const getSentimentIcon = (sentiment) => {
  switch (sentiment) {
    case 'Caliente': return 'mdi-fire'
    case 'Tibio': return 'mdi-thermometer'
    case 'Frio': return 'mdi-snowflake'
    default: return 'mdi-help-circle'
  }
}

onMounted(async () => {
  await loadPrefs()
  fetchPipeline()
})
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="crm-pipeline" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Mi Pipeline" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <!-- Selector y orden de Columnas -->
          <UPopover :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-mdi-view-column"
              label="Columnas"
            />

            <template #content>
              <div class="w-80 p-2">
                <div class="flex items-center gap-2 mb-2 px-2">
                  <span class="text-xs uppercase tracking-wide text-muted">Columnas (arrastra para reordenar)</span>
                  <div class="flex-1" />
                  <UTooltip text="Restablecer orden original">
                    <UButton
                      icon="i-mdi-restart"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      @click="resetColumnPrefs"
                    />
                  </UTooltip>
                </div>

                <ul class="max-h-96 overflow-y-auto">
                  <li
                    v-for="(key, idx) in columnOrder"
                    :key="key"
                    draggable="true"
                    class="flex items-center gap-2 px-2 py-1.5 cursor-grab border-b border-default last:border-b-0 hover:bg-elevated/50 transition"
                    :class="{ 'opacity-40': draggingIndex === idx, 'opacity-85': isMandatory(key) }"
                    @dragstart="onDragStart(idx, $event)"
                    @dragover.prevent="onDragOver(idx, $event)"
                    @drop.prevent="onDrop(idx)"
                    @dragend="onDragEnd"
                  >
                    <UIcon name="i-mdi-drag" class="size-4 shrink-0 opacity-50" />
                    <span class="text-sm flex-1 truncate">{{ getHeaderTitle(key) }}</span>
                    <UCheckbox
                      :model-value="!hiddenColumns.includes(key)"
                      :disabled="isMandatory(key)"
                      @update:model-value="(v) => toggleColumnVisibility(key, v)"
                    />
                  </li>
                </ul>
              </div>
            </template>
          </UPopover>

          <UButton
            color="primary"
            icon="i-mdi-refresh"
            label="Actualizar"
            :loading="loading"
            @click="fetchPipeline"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mb-4">
        <p class="text-muted">
          Gestión de Oportunidades (SAP B1 OQUT)
        </p>
      </div>

      <!-- KPIs. Paleta de marca: azul #0096D5 para lo principal y gris #2C3038
           para lo estructural. Los colores semánticos (success/warning/error)
           quedan reservados para estados, no para categorías. -->
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
          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-primary">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Cotizaciones
            </div>
            <div class="text-2xl font-bold text-primary">
              {{ filteredPipeline.length }}
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-primary">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Monto Total
            </div>
            <div class="text-2xl font-bold text-primary">
              {{ formatCurrency(totalSum) }}
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-ink-800 dark:border-t-ink-300">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Clientes
            </div>
            <div class="text-2xl font-bold text-ink-800 dark:text-ink-200">
              {{ totalClients }}
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-primary-400">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Transaccional
            </div>
            <div class="text-xl font-bold text-primary-500 dark:text-primary-400">
              {{ formatCurrency(sumTransactional) }}
            </div>
            <div class="text-xs text-dimmed">
              {{ countTransactional }} docs
            </div>
          </UCard>

          <UCard :ui="{ body: 'text-center' }" class="border-t-4 border-t-ink-700 dark:border-t-ink-300">
            <div class="text-xs uppercase tracking-wide text-muted mb-1">
              Proyecto
            </div>
            <div class="text-xl font-bold text-ink-700 dark:text-ink-300">
              {{ formatCurrency(sumProject) }}
            </div>
            <div class="text-xs text-dimmed">
              {{ countProject }} docs
            </div>
          </UCard>
        </template>
      </div>

      <UAlert
        v-if="errorCarga"
        icon="i-mdi-alert-circle-outline"
        color="error"
        variant="subtle"
        title="No se pudo cargar el pipeline"
        :description="errorCarga"
        class="mb-4"
      />

      <!-- La tarjeta ocupa el espacio restante y es la única que scrollea por
           dentro: los indicadores y los filtros quedan siempre a la vista. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <div class="p-4 bg-elevated/30 border-b border-default shrink-0">
          <!-- Búsqueda global -->
          <UInput
            v-model="filters.cliente"
            icon="i-mdi-magnify"
            placeholder="Búsqueda rápida (Cliente, Folio, Detalle...)"
            size="lg"
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="filters.cliente" #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-circle-x"
                aria-label="Limpiar búsqueda"
                @click="filters.cliente = ''"
              />
            </template>
          </UInput>

          <USeparator class="my-4" />

          <!-- Filtros específicos -->
          <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <UFormField label="Año">
              <USelect
                v-model="filters.year"
                :items="yearOptions"
                class="w-full"
                @update:model-value="fetchPipeline"
              />
            </UFormField>

            <UFormField label="Mes">
              <USelectMenu
                v-model="filters.month"
                :items="monthOptions"
                multiple
                label-key="text"
                value-key="value"
                placeholder="Todo el año"
                class="w-full"
                @update:model-value="fetchPipeline"
              />
            </UFormField>

            <UFormField label="Vendedor">
              <USelectMenu
                v-model="filters.vendedor"
                :items="vendedorOptions"
                multiple
                icon="i-mdi-account-tie"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Etapa">
              <USelectMenu
                v-model="filters.etapa"
                :items="stageOptions"
                multiple
                icon="i-mdi-trending-up"
                placeholder="Todas"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Tipo de Venta">
              <USelectMenu
                v-model="filters.tipo"
                :items="['Transaccional', 'Proyecto']"
                multiple
                icon="i-mdi-briefcase-outline"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Propietario">
              <USelectMenu
                v-model="filters.propietario"
                :items="propietarioOptions"
                multiple
                icon="i-mdi-account-star"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>
          </div>

          <!-- Filtros activos: un chip por valor, removible uno a uno -->
          <div v-if="filtrosActivos.length" class="flex flex-wrap items-center gap-1 mt-3">
            <span class="text-xs text-muted mr-1">Filtros activos:</span>

            <UBadge
              v-for="chip in filtrosActivos"
              :key="`${chip.campo}-${chip.valor}`"
              color="neutral"
              variant="subtle"
              size="sm"
              class="max-w-52"
            >
              <span class="truncate">{{ chip.texto }}</span>
              <UIcon
                name="i-lucide-x"
                class="size-3 ml-1 cursor-pointer shrink-0"
                @click="quitarFiltro(chip.campo, chip.valor)"
              />
            </UBadge>

            <UButton
              color="neutral"
              variant="link"
              size="xs"
              label="Limpiar todo"
              icon="i-lucide-circle-x"
              @click="limpiarFiltros"
            />
          </div>

          <p v-else class="text-xs text-muted mt-3">
            Sin filtros: se muestra el año {{ filters.year }} completo.
          </p>
        </div>

        <UTable
          v-model:sorting="sorting"
          :data="filteredPipeline"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="flex-1 min-h-0 overflow-y-auto"
          :ui="{
            base: 'table-fixed w-full',
            td: 'text-sm py-2',
            th: 'text-xs py-2'
          }"
          @select="(_e, row) => openQuoteDialog(row.original)"
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
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-28 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
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
                {{ hayFiltros ? 'Ninguna cotización coincide con los filtros' : 'Aún no hay cotizaciones' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba quitando algún filtro o amplía el rango de meses.'
                  : `No se encontraron cotizaciones para ${filters.year}. Cambia el año o revisa más adelante.` }}
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
                @click="fetchPipeline"
              />
            </div>
          </template>

          <template #Folio-cell="{ row }">
            <span
              class="text-primary font-black cursor-pointer hover:underline"
              @click.stop="openQuoteDialog(row.original)"
            >
              #{{ row.original.Folio }}
            </span>
          </template>

          <template #Tipo-cell="{ row }">
            <UBadge
              :color="row.original.Tipo === 'Proyecto' ? 'primary' : 'info'"
              variant="solid"
              size="sm"
              class="font-bold"
            >
              {{ row.original.Tipo }}
            </UBadge>
          </template>

          <template #Sentimiento-cell="{ row }">
            <UBadge
              :color="badgeColor(getSentimentColor(row.original.Sentimiento))"
              variant="soft"
              size="sm"
              class="font-bold"
              :icon="`i-${getSentimentIcon(row.original.Sentimiento)}`"
            >
              {{ row.original.Sentimiento }}
            </UBadge>
          </template>

          <template #Cliente-cell="{ row }">
            <span
              class="block truncate text-primary cursor-pointer underline font-medium"
              :title="row.original.Cliente"
              @click.stop="handleOpenHistory({ cardCode: row.original.CardCode, customerName: row.original.Cliente })"
            >
              {{ row.original.Cliente }}
            </span>
          </template>

          <template #Monto-cell="{ row }">
            <span class="font-bold">
              {{ row.original.Moneda === 'USD' ? formatCurrency(row.original.MontoUSD, 'USD') : formatCurrency(row.original.Monto, 'MXN') }}
            </span>
          </template>

          <template #OpportunityName-cell="{ row }">
            <UTooltip
              v-if="row.original.OpportunityID"
              :text="`${row.original.OpportunityName || ('Oportunidad #' + row.original.OpportunityID)} · ${row.original.OpportunityCount} cotizaciones · valor ${formatCurrency(row.original.OpportunityValue, 'MXN')}`"
            >
              <button
                type="button"
                class="rounded px-2 py-0.5 text-xs font-bold text-white"
                :style="{ backgroundColor: oppHex(row.original.OpportunityID) }"
                @click.stop="goToOpportunity(row.original.OpportunityID)"
              >
                #{{ row.original.OpportunityID }}
              </button>
            </UTooltip>
            <span v-else class="text-xs text-dimmed">—</span>
          </template>

          <template #Etapa-cell="{ row }">
            <span
              :class="getStageColor(row.original.Etapa)"
              class="block truncate text-xs font-bold"
              :title="row.original.Etapa"
            >
              {{ row.original.Etapa }}
            </span>
          </template>

          <template #UltimaAccion-cell="{ row }">
            <div
              class="truncate text-xs text-muted"
              :title="row.original.UltimaAccion || 'Sin seguimiento'"
            >
              {{ row.original.UltimaAccion || 'Sin seguimiento' }}
            </div>
          </template>

          <template #Vendedor-cell="{ row }">
            <span class="block truncate text-xs" :title="row.original.Vendedor">
              {{ row.original.Vendedor }}
            </span>
          </template>

          <template #Propietario-cell="{ row }">
            <span class="block truncate text-xs" :title="row.original.Propietario">
              {{ row.original.Propietario }}
            </span>
          </template>

          <template #FechaContabilizacion-cell="{ row }">
            <span class="text-xs whitespace-nowrap">{{ formatDateShort(row.original.FechaContabilizacion) }}</span>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              icon="i-mdi-eye"
              size="xs"
              variant="ghost"
              color="primary"
              @click.stop="openQuoteDialog(row.original)"
            />
          </template>
        </UTable>
      </UCard>

      <QuoteDetailDialog
        v-model="showQuoteDialog"
        :folio="selectedFolio"
        :item="selectedItem"
        @open-customer-history="handleOpenHistory"
        @update:item="onItemUpdated"
      />

      <CustomerQuotesDialog
        v-model="showHistoryDialog"
        :card-code="selectedCardCode"
        :customer-name="selectedCustomerName"
        @open-quote-detail="handleOpenQuote"
      />
    </template>
  </UDashboardPanel>
</template>
