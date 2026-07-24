<script setup>
// Libro Mayor de tesorería.
// Migrado desde views/tesoreria/LibroMayor.vue (Vuetify 3).
import * as XLSX from 'xlsx'
import { useAuthStore } from '~/stores/auth'
import axios from '~/utils/axios'

const authStore = useAuthStore()
const toast = useToast()

const items = ref([])
const sobres = ref([])
const categorias = ref([])
const loading = ref(false), saving = ref(false), deleting = ref(false)
const search = ref('')
const notify = (text, color = 'success') => { toast.add({ title: text, color }) }

// `w` es el peso de la columna en porcentaje. Con `table-fixed` estos anchos
// mandan y el texto largo se recorta con elipsis en vez de ensanchar la tabla.
// Concepto y Ruta se llevan la mayor parte por ser los campos de texto libre;
// los importes tienen ancho predecible y acciones sólo aloja iconos.
const columnasBase = [
  { key: 'fecha', header: 'Fecha', w: 'w-[11%]', align: '' },
  { key: 'tipo', header: 'Tipo', w: 'w-[7%]', align: '' },
  { key: 'concepto', header: 'Concepto', w: 'w-[20%]', align: '' },
  { key: 'categoria', header: 'Categoría', w: 'w-[11%]', align: '' },
  { key: 'ruta', header: 'Ruta / Sobre', w: 'w-[13%]', align: '' },
  { key: 'monto', header: 'Monto Op.', w: 'w-[9%]', align: 'text-right' },
  { key: 'ingreso', header: 'Ingreso', w: 'w-[8%]', align: 'text-right' },
  { key: 'egreso', header: 'Egreso', w: 'w-[8%]', align: 'text-right' },
  { key: 'usuario', header: 'Usuario', w: 'w-[8%]', align: '' },
  { key: 'acciones', header: '', w: 'w-[5%]', align: 'text-right' }
]

const columns = columnasBase.map(c => ({
  accessorKey: c.key,
  header: c.header,
  meta: {
    class: {
      th: [c.w, 'px-2 truncate', c.align].filter(Boolean).join(' '),
      td: ['px-2 truncate', c.align].filter(Boolean).join(' ')
    }
  }
}))

const tiposMovimiento = ['Ingreso', 'Egreso', 'Traspaso']

// --- Periodo ---
// La tabla arranca acotada al mes en curso. El endpoint devuelve el histórico
// completo (más de 4000 operaciones) y responde rápido, pero pintar todas esas
// filas de golpe es lo que trababa la vista. Acotar el periodo por omisión
// resuelve el problema sin perder el acceso al histórico: basta con quitar el
// mes para ver el año, o marcar "Todo el histórico".
// La implementación vive en el composable compartido, para que Caja Chica y
// Libro Mayor se comporten igual.
const {
  periodo,
  MESES,
  aniosDisponibles,
  enPeriodo,
  periodoEsPredeterminado,
  limpiarPeriodo,
  etiquetaMes
} = useFiltroPeriodo(items, 'fecha')

// Filtros de catálogo de la barra superior. Todos son multi-selección y un
// arreglo vacío significa "sin filtro" (equivale a Todos), así que siempre
// existe la opción de no seleccionar nada.
const topFilters = ref({ tipo: [], categoria: [], ruta: [], usuario: [] })

// Filtros por columna: uno por cada columna con contenido filtrable. Se
// conservan y se SUMAN a los de la barra superior.
const colFilters = ref({
  fecha: '', tipo: '', concepto: '', categoria: '',
  ruta: '', monto: '', ingreso: '', egreso: '', usuario: ''
})

const hayFiltrosColumna = computed(() => Object.values(colFilters.value).some(v => v !== ''))

const limpiarFiltrosColumna = () => {
  Object.keys(colFilters.value).forEach((k) => { colFilters.value[k] = '' })
}

// Las opciones se derivan de los datos ya cargados, no de un catálogo fijo, así
// que sólo se ofrece lo que realmente aparece en el libro.
const opcionesUnicas = selector => [...new Set(
  items.value.map(selector).filter(v => v && v !== '-' && v !== '—')
)].sort()
const categoriaOptions = computed(() => opcionesUnicas(o => o.categoria))
const rutaOptions = computed(() => opcionesUnicas(o => ruta(o)))
const usuarioOptions = computed(() => opcionesUnicas(o => o.usuario))

// Un chip por cada valor seleccionado, de cualquier filtro de la barra.
const filtrosActivos = computed(() => {
  const chips = []
  const agregar = (campo, valores, etiqueta = v => v) => {
    (valores || []).forEach(v => chips.push({ campo, valor: v, texto: etiqueta(v) }))
  }
  // Con "todo el histórico" el mes no aplica, así que no se muestra como chip.
  if (!periodo.value.historico) agregar('mes', periodo.value.meses, etiquetaMes)
  agregar('tipo', topFilters.value.tipo)
  agregar('categoria', topFilters.value.categoria)
  agregar('ruta', topFilters.value.ruta)
  agregar('usuario', topFilters.value.usuario)
  return chips
})

const quitarFiltro = (campo, valor) => {
  if (campo === 'mes') {
    periodo.value.meses = periodo.value.meses.filter(v => v !== valor)
    return
  }
  topFilters.value[campo] = topFilters.value[campo].filter(v => v !== valor)
}

// Hay filtros activos si se escribió una búsqueda, si algún filtro de la barra
// o de columna tiene valor, o si el periodo dejó de ser el predeterminado (el
// periodo por omisión es el estado normal de la pantalla, no un filtro).
const hayFiltros = computed(() =>
  !!search.value.trim()
  || hayFiltrosColumna.value
  || Object.values(topFilters.value).some(v => v.length > 0)
  || !periodoEsPredeterminado.value)

const limpiarFiltros = () => {
  search.value = ''
  limpiarFiltrosColumna()
  topFilters.value = { tipo: [], categoria: [], ruta: [], usuario: [] }
  limpiarPeriodo()
}

// Filtrado completo (periodo + filtros de la barra + filtros de columna +
// búsqueda). El export usa este mismo resultado, así que respeta todos.
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const f = colFilters.value
  const top = topFilters.value
  const inc = (val, term) => String(val ?? '').toLowerCase().includes(String(term).toLowerCase())
  // Los montos se comparan por texto para permitir búsquedas parciales ("1.5").
  const incNum = (val, term) => String(val ?? '').includes(String(term).trim())

  return items.value.filter((o) => {
    if (!enPeriodo(o)) return false

    // Barra superior (multi-selección): arreglo vacío = sin filtro.
    if (top.tipo.length && !top.tipo.includes(o.tipo)) return false
    if (top.categoria.length && !top.categoria.includes(o.categoria)) return false
    if (top.ruta.length && !top.ruta.includes(ruta(o))) return false
    if (top.usuario.length && !top.usuario.includes(o.usuario)) return false

    if (f.fecha && !inc(fmtDate(o.fecha), f.fecha)) return false
    if (f.tipo && !inc(o.tipo, f.tipo)) return false
    if (f.concepto && !inc(o.concepto, f.concepto)) return false
    if (f.categoria && !inc(o.categoria, f.categoria)) return false
    if (f.ruta && !inc(ruta(o), f.ruta)) return false
    if (f.usuario && !inc(o.usuario, f.usuario)) return false
    if (f.monto && !incNum(o.monto, f.monto)) return false
    if (f.ingreso && !incNum(o.ingreso, f.ingreso)) return false
    if (f.egreso && !incNum(o.egreso, f.egreso)) return false

    if (q) {
      const hay = [o.concepto, o.tipo, o.categoria, o.subcategoria, ruta(o), o.usuario, fmtDate(o.fecha)]
        .map(x => String(x ?? '').toLowerCase()).join(' ')
      if (!hay.includes(q)) return false
    }
    return true
  })
})

// El v-data-table ordenaba por fecha descendente por defecto.
const filteredOrdenado = computed(() =>
  [...filtered.value].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)))

const load = async () => {
  loading.value = true
  try {
    const [ro, rs, rc] = await Promise.all([
      axios.get('/tesoreria/operaciones'),
      axios.get('/tesoreria/sobres'),
      axios.get('/tesoreria/categorias')
    ])
    items.value = ro.data.map(o => ({
      ...o,
      ingreso: parseFloat(o.ingreso || 0),
      egreso: parseFloat(o.egreso || 0),
      monto: parseFloat(o.monto || 0)
    }))
    sobres.value = rs.data.map(s => s.nombre)
    categorias.value = rc.data
  } catch (e) { notify('Error cargando operaciones', 'error') } finally { loading.value = false }
}

// Detalle
const detalle = ref({ show: false, op: null, conciliaciones: [] })
const onRow = async (row) => {
  const item = row?.original ?? row
  try {
    const r = await axios.get(`/tesoreria/operaciones/${item.id}`)
    detalle.value = { show: true, op: r.data.operacion, conciliaciones: r.data.conciliaciones || [] }
  } catch (e) { notify('Error abriendo detalle', 'error') }
}

// Editar
const edit = ref({ show: false, id: null, tipo: 'Ingreso', monto: null, concepto: '', sobreOrigen: null, sobreDestino: null, categoria: null, subcategoria: null, tieneConciliacion: false, facturaActual: null, facturaNueva: null })
const editErrors = ref({})
const subcatsEdit = computed(() => categorias.value.find(c => c.nombre === edit.value.categoria)?.subcategorias || [])
const onTipoChange = () => { /* mantener valores; el template oculta lo no aplicable */ }
const openEdit = async (o) => {
  editErrors.value = {}
  edit.value = {
    show: true, id: o.id, tipo: o.tipo, monto: Number(o.monto), concepto: o.concepto,
    sobreOrigen: o.sobre_origen || null, sobreDestino: o.sobre_destino || null,
    categoria: (o.categoria && o.categoria !== '-') ? o.categoria : null, subcategoria: o.subcategoria || null,
    tieneConciliacion: false, facturaActual: null, facturaNueva: null
  }
  try {
    const r = await axios.get(`/tesoreria/operaciones/${o.id}`)
    const c = (r.data.conciliaciones || [])[0]
    if (c) {
      edit.value.tieneConciliacion = true
      edit.value.facturaActual = { folio_sap: c.sap_docnum, numatcard: c.numatcard, subtotal: c.subtotal, docentry: c.sap_docentry }
    }
  } catch (e) { /* sin conciliación */ }
}

// Modal de selección de factura para el cambio en edición
const facturaModal = ref({ show: false, loading: false, items: [], search: '' })
const facturaColumns = [
  { accessorKey: 'card_code', header: 'Prov.' },
  { accessorKey: 'folio_sap', header: 'Folio' },
  { accessorKey: 'numatcard', header: 'Ref.' },
  { accessorKey: 'concepto', header: 'Concepto' },
  { accessorKey: 'fecha', header: 'Fecha' },
  { accessorKey: 'subtotal', header: 'Valor', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'abonado', header: 'Abonado', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'pendiente', header: 'Pendiente', meta: { class: { th: 'text-right', td: 'text-right' } } }
]
const facturasFiltradas = computed(() => {
  const q = facturaModal.value.search.trim().toLowerCase()
  if (!q) return facturaModal.value.items
  return facturaModal.value.items.filter(f =>
    [f.folio_sap, f.numatcard, f.concepto, f.card_name]
      .map(x => String(x ?? '').toLowerCase()).join(' ').includes(q))
})
const FACTURA_PAGE_SIZE = 10
const facturaPage = ref(1)
const facturasPagina = computed(() => {
  const start = (facturaPage.value - 1) * FACTURA_PAGE_SIZE
  return facturasFiltradas.value.slice(start, start + FACTURA_PAGE_SIZE)
})
watch(() => facturaModal.value.search, () => { facturaPage.value = 1 })

const openFacturaModal = async () => {
  facturaModal.value.show = true
  facturaModal.value.loading = true
  facturaPage.value = 1
  try {
    const r = await axios.get('/tesoreria/sap/facturas-proveedor')
    facturaModal.value.items = r.data.map(f => ({ ...f, pendiente: Number(f.subtotal) - Number(f.abonado || 0) }))
  } catch (e) { notify('Error cargando facturas SAP', 'error') } finally { facturaModal.value.loading = false }
}
const selectFacturaEdit = (f) => { const row = f?.raw ?? f; if (row) edit.value.facturaNueva = row; facturaModal.value.show = false }
const onRowFacturaEdit = row => selectFacturaEdit(row?.original ?? row)

// Validación equivalente a la regla del v-form original (monto > 0)
const validateEdit = () => {
  const e = {}
  if (!(Number(edit.value.monto) > 0)) e.monto = 'Requerido'
  editErrors.value = e
  return Object.keys(e).length === 0
}

const save = async () => {
  if (!validateEdit()) return
  saving.value = true
  try {
    await axios.put(`/tesoreria/operaciones/${edit.value.id}`, {
      concepto: edit.value.concepto,
      tipo: edit.value.tipo,
      monto: edit.value.monto,
      categoria: edit.value.tipo === 'Egreso' ? edit.value.categoria : null,
      subcategoria: edit.value.tipo === 'Egreso' ? edit.value.subcategoria : null,
      sobreOrigen: edit.value.tipo !== 'Ingreso' ? edit.value.sobreOrigen : null,
      sobreDestino: edit.value.tipo !== 'Egreso' ? edit.value.sobreDestino : null,
      docentry: edit.value.facturaNueva ? edit.value.facturaNueva.docentry : undefined,
      usuario: authStore.user?.name || 'Usuario'
    })
    notify('Operación actualizada')
    edit.value.show = false
    await load()
  } catch (e) { notify(e.response?.data?.message || 'Error al guardar', 'error') } finally { saving.value = false }
}

// Eliminar
const del = ref({ show: false, item: null })
const askDelete = (o) => { del.value = { show: true, item: o } }
const confirmDelete = async () => {
  deleting.value = true
  try {
    await axios.delete(`/tesoreria/operaciones/${del.value.item.id}`)
    notify('Operación eliminada')
    del.value.show = false
    await load()
  } catch (e) { notify('Error al eliminar', 'error') } finally { deleting.value = false }
}

// Exportar a Excel las operaciones filtradas
const exportExcel = () => {
  const rows = filtered.value.map(o => ({
    'Fecha': fmtDate(o.fecha),
    'Concepto': o.concepto || '',
    'Tipo': o.tipo,
    'Categoría': (o.categoria && o.categoria !== '-') ? o.categoria : '',
    'Subcategoría': o.subcategoria || '',
    'Sobre origen': o.sobre_origen || '',
    'Sobre destino': o.sobre_destino || '',
    'Ingreso': Number(o.ingreso || 0),
    'Egreso': Number(o.egreso || 0),
    'Monto': Number(o.monto || 0),
    'Usuario': o.usuario || ''
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Libro Mayor')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `libro_mayor_${stamp}.xlsx`)
}

const ruta = o => o.tipo === 'Traspaso' ? `${o.sobre_origen || '-'} → ${o.sobre_destino || '-'}` : (o.sobre_destino || o.sobre_origen || '—')
const money = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
const tipoColor = t => t === 'Ingreso' ? 'success' : (t === 'Egreso' ? 'error' : 'warning')

onMounted(load)
</script>

<template>
  <!-- La página scrollea; el encabezado de la tabla se queda fijo arriba. -->
  <UDashboardPanel id="tesoreria-libro-mayor">
    <template #header>
      <UDashboardNavbar title="Libro Mayor">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UTooltip text="Recargar">
            <UButton
              icon="i-mdi-refresh"
              color="neutral"
              variant="ghost"
              square
              :loading="loading"
              @click="load"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- La tarjeta crece con su contenido; el scroll es el de la página.
           overflow-visible para no atrapar el sticky del encabezado. -->
      <UCard :ui="{ root: 'overflow-visible', body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex items-center flex-wrap gap-2">
            <UIcon name="i-mdi-book-open-variant" class="size-5 text-primary" />
            <span class="font-semibold text-highlighted">Todas las operaciones</span>
            <div class="flex-1" />
            <UButton
              color="success"
              variant="soft"
              icon="i-mdi-file-excel"
              :disabled="!filtered.length"
              @click="exportExcel"
            >
              Exportar Excel
            </UButton>
            <UBadge color="primary" variant="solid">
              {{ filtered.length }} operaciones
            </UBadge>
          </div>
        </template>

        <!-- Barra de filtros superior: búsqueda global, rejilla de filtros y
             chips de lo que está activo. Misma experiencia que el pipeline. -->
        <div class="p-4 bg-elevated/30 border-b border-default">
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Búsqueda rápida (concepto, categoría, ruta, usuario…)"
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

          <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <UFormField label="Año">
              <USelect
                v-model="periodo.anio"
                :items="aniosDisponibles"
                :disabled="periodo.historico"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Mes">
              <USelectMenu
                v-model="periodo.meses"
                :items="MESES"
                multiple
                value-key="value"
                label-key="label"
                placeholder="Todo el año"
                :disabled="periodo.historico"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Tipo">
              <USelectMenu
                v-model="topFilters.tipo"
                :items="tiposMovimiento"
                multiple
                icon="i-mdi-swap-vertical"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Categoría">
              <USelectMenu
                v-model="topFilters.categoria"
                :items="categoriaOptions"
                multiple
                icon="i-mdi-folder-outline"
                placeholder="Todas"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Ruta / Sobre">
              <USelectMenu
                v-model="topFilters.ruta"
                :items="rutaOptions"
                multiple
                icon="i-mdi-email-outline"
                placeholder="Todas"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Usuario">
              <USelectMenu
                v-model="topFilters.usuario"
                :items="usuarioOptions"
                multiple
                icon="i-mdi-account-outline"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="mt-3">
            <UCheckbox v-model="periodo.historico" label="Todo el histórico" />
            <p v-if="periodo.historico" class="text-xs text-warning mt-2">
              Mostrando el histórico completo. Con muchos movimientos la tabla puede
              tardar en responder; acota el periodo si la notas lenta.
            </p>
          </div>

          <!-- Filtros activos: un chip por valor, removible uno a uno -->
          <div v-if="filtrosActivos.length || hayFiltros" class="flex flex-wrap items-center gap-1 mt-3">
            <span v-if="filtrosActivos.length" class="text-xs text-muted mr-1">Filtros activos:</span>

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
              v-if="hayFiltrosColumna"
              color="neutral"
              variant="link"
              size="xs"
              label="Limpiar filtros de columna"
              icon="i-lucide-filter-x"
              @click="limpiarFiltrosColumna"
            />

            <UButton
              v-if="hayFiltros"
              color="neutral"
              variant="link"
              size="xs"
              label="Limpiar todo"
              icon="i-lucide-circle-x"
              @click="limpiarFiltros"
            />
          </div>

          <p v-else class="text-xs text-muted mt-3">
            Sin filtros: se muestra el año {{ periodo.anio }} completo.
          </p>
        </div>

        <UTable
          :data="filteredOrdenado"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="text-xs tabla-mayor"
          :ui="{
            root: 'overflow-visible',
            base: 'table-fixed w-full overflow-visible',
            thead: 'bg-default backdrop-blur-none shadow-sm',
            tr: 'cursor-pointer',
            td: 'text-xs py-2',
            th: 'text-xs py-2 bg-default'
          }"
          @select="(_e, row) => onRow(row)"
        >
          <!-- Filtros por columna -->
          <template #fecha-header="{ column }">
            <div class="flex items-center gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.fecha ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="colFilters.fecha"
                      placeholder="Ej. 19 jul"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #tipo-header="{ column }">
            <div class="flex items-center gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.tipo ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-48">
                    <UInput
                      v-model="colFilters.tipo"
                      placeholder="Ingreso, Egreso…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #monto-header="{ column }">
            <div class="flex items-center justify-end gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.monto ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-48">
                    <UInput
                      v-model="colFilters.monto"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #ingreso-header="{ column }">
            <div class="flex items-center justify-end gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.ingreso ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-48">
                    <UInput
                      v-model="colFilters.ingreso"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #egreso-header="{ column }">
            <div class="flex items-center justify-end gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.egreso ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-48">
                    <UInput
                      v-model="colFilters.egreso"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #concepto-header="{ column }">
            <div class="flex items-center gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.concepto ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="colFilters.concepto"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #categoria-header="{ column }">
            <div class="flex items-center gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.categoria ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="colFilters.categoria"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #ruta-header="{ column }">
            <div class="flex items-center gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.ruta ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="colFilters.ruta"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #usuario-header="{ column }">
            <div class="flex items-center gap-1">
              <span>{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  square
                  :color="colFilters.usuario ? 'primary' : 'neutral'"
                  @click.stop
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="colFilters.usuario"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <!-- Celdas -->
          <template #fecha-cell="{ row }">
            <span class="text-muted block truncate">{{ fmtDate(row.original.fecha) }}</span>
          </template>
          <template #tipo-cell="{ row }">
            <UBadge
              :color="tipoColor(row.original.tipo)"
              variant="subtle"
              size="sm"
              class="font-bold"
            >
              {{ row.original.tipo }}
            </UBadge>
          </template>
          <template #concepto-cell="{ row }">
            <span :title="row.original.concepto" class="block truncate">{{ row.original.concepto }}</span>
          </template>
          <template #categoria-cell="{ row }">
            <span
              class="block truncate"
              :title="(row.original.categoria && row.original.categoria !== '-' ? row.original.categoria : '') + (row.original.subcategoria ? ' / ' + row.original.subcategoria : '')"
            >
              {{ row.original.categoria && row.original.categoria !== '-' ? row.original.categoria : '—' }}<span v-if="row.original.subcategoria" class="text-muted"> / {{ row.original.subcategoria }}</span>
            </span>
          </template>
          <template #ruta-cell="{ row }">
            <span class="text-muted block truncate" :title="ruta(row.original)">{{ ruta(row.original) }}</span>
          </template>
          <template #monto-cell="{ row }">
            <span class="font-bold whitespace-nowrap">{{ money(row.original.monto) }}</span>
          </template>
          <template #ingreso-cell="{ row }">
            <span v-if="row.original.ingreso > 0" class="text-success font-bold whitespace-nowrap">+{{ money(row.original.ingreso) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
          <template #egreso-cell="{ row }">
            <span v-if="row.original.egreso > 0" class="text-error font-bold whitespace-nowrap">-{{ money(row.original.egreso) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
          <template #acciones-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UTooltip text="Editar">
                <UButton
                  icon="i-mdi-pencil"
                  size="xs"
                  variant="ghost"
                  color="primary"
                  square
                  @click.stop="openEdit(row.original)"
                />
              </UTooltip>
              <UTooltip text="Eliminar">
                <UButton
                  icon="i-mdi-delete-outline"
                  size="xs"
                  variant="ghost"
                  color="error"
                  square
                  @click.stop="askDelete(row.original)"
                />
              </UTooltip>
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
                {{ hayFiltros ? 'Ninguna operación coincide con los filtros' : 'Aún no hay operaciones' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba quitando algún filtro, amplía el periodo o borra el texto de la búsqueda.'
                  : 'Todavía no se ha registrado ningún movimiento en el libro mayor.' }}
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
                @click="load"
              />
            </div>
          </template>
        </UTable>
      </UCard>

      <!-- DETALLE -->
      <UModal
        v-model:open="detalle.show"
        :title="detalle.op ? `Operación #${detalle.op.id} · ${detalle.op.tipo}` : 'Operación'"
        :ui="{ content: 'max-w-xl' }"
      >
        <template #body>
          <div v-if="detalle.op" class="text-sm">
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Fecha</span><span>{{ fmtDate(detalle.op.fecha) }}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Concepto</span><span>{{ detalle.op.concepto || '—' }}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Monto</span><span class="font-bold">{{ money(detalle.op.monto) }}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Ingreso / Egreso</span>
              <span>{{ money(detalle.op.ingreso) }} / {{ money(detalle.op.egreso) }}</span>
            </div>
            <div v-if="detalle.op.categoria" class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Categoría</span>
              <span>{{ detalle.op.categoria }}<span v-if="detalle.op.subcategoria"> / {{ detalle.op.subcategoria }}</span></span>
            </div>
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Sobre origen → destino</span>
              <span>{{ detalle.op.sobre_origen || '—' }} → {{ detalle.op.sobre_destino || '—' }}</span>
            </div>
            <div v-if="detalle.op.tipo_ingreso" class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Tipo de ingreso</span><span>{{ detalle.op.tipo_ingreso }}</span>
            </div>
            <div v-if="detalle.op.origen_ingreso" class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Origen</span><span>{{ detalle.op.origen_ingreso }}</span>
            </div>
            <div v-if="detalle.op.num_cheque" class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">No. cheque</span><span>{{ detalle.op.num_cheque }}</span>
            </div>
            <div v-if="detalle.op.contado" class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Efectivo contado</span>
              <span>{{ money(detalle.op.monto_contado) }} <span class="text-muted">({{ fmtDate(detalle.op.fecha_conteo) }})</span></span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-muted">Usuario</span><span>{{ detalle.op.usuario || '—' }}</span>
            </div>

            <template v-if="detalle.conciliaciones.length">
              <div class="text-sm font-semibold text-highlighted mt-3 mb-1">
                Conciliación de factura
              </div>
              <UAlert
                v-for="c in detalle.conciliaciones"
                :key="c.id"
                color="info"
                variant="soft"
                class="mb-1"
                :description="`Folio ${c.sap_docnum} · Ref ${c.numatcard || '—'} · ${money(c.monto_abonado)} de ${money(c.subtotal)}`"
              />
            </template>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="detalle.show = false">
              Cerrar
            </UButton>
            <UButton color="primary" icon="i-mdi-pencil" @click="openEdit(detalle.op); detalle.show = false">
              Editar
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- EDITAR -->
      <UModal
        v-model:open="edit.show"
        :title="`Editar operación #${edit.id}`"
        :dismissible="false"
        :ui="{ content: 'max-w-lg' }"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Tipo">
              <USelect
                v-model="edit.tipo"
                :items="['Ingreso', 'Egreso', 'Traspaso']"
                class="w-full"
                @update:model-value="onTipoChange"
              />
            </UFormField>

            <UFormField label="Monto ($)" required :error="editErrors.monto">
              <UInput v-model.number="edit.monto" type="number" class="w-full">
                <template #leading>
                  <span class="text-muted text-sm">$</span>
                </template>
              </UInput>
            </UFormField>

            <UFormField label="Concepto">
              <UInput v-model="edit.concepto" class="w-full" />
            </UFormField>

            <UFormField v-if="edit.tipo !== 'Ingreso'" label="Sobre origen">
              <USelectMenu
                v-model="edit.sobreOrigen"
                :items="sobres"
                placeholder="Sin sobre"
                class="w-full"
              />
            </UFormField>

            <UFormField v-if="edit.tipo !== 'Egreso'" label="Sobre destino">
              <USelectMenu
                v-model="edit.sobreDestino"
                :items="sobres"
                placeholder="Sin sobre"
                class="w-full"
              />
            </UFormField>

            <template v-if="edit.tipo === 'Egreso'">
              <UFormField label="Categoría">
                <USelectMenu
                  v-model="edit.categoria"
                  :items="categorias"
                  label-key="nombre"
                  value-key="nombre"
                  placeholder="Sin categoría"
                  class="w-full"
                  @update:model-value="edit.subcategoria = null"
                />
              </UFormField>
              <UFormField v-if="subcatsEdit.length" label="Subcategoría">
                <USelectMenu
                  v-model="edit.subcategoria"
                  :items="subcatsEdit"
                  label-key="nombre"
                  value-key="nombre"
                  placeholder="Sin subcategoría"
                  class="w-full"
                />
              </UFormField>
            </template>

            <!-- Cambiar factura conciliada (Abono de Deudor por factura) -->
            <template v-if="edit.tieneConciliacion">
              <USeparator />
              <div class="text-xs text-muted mb-1">
                Factura conciliada
              </div>
              <UAlert
                v-if="edit.facturaNueva"
                color="success"
                variant="soft"
                class="mb-2"
                :description="`Nueva: Folio ${edit.facturaNueva.folio_sap} · Ref ${edit.facturaNueva.numatcard || '—'} · ${money(edit.facturaNueva.subtotal)}`"
              />
              <UAlert
                v-else-if="edit.facturaActual"
                color="info"
                variant="soft"
                class="mb-2"
                :description="`Actual: Folio ${edit.facturaActual.folio_sap} · Ref ${edit.facturaActual.numatcard || '—'} · ${money(edit.facturaActual.subtotal)}`"
              />
              <UButton
                size="sm"
                color="primary"
                variant="soft"
                icon="i-mdi-file-search-outline"
                @click="openFacturaModal"
              >
                Cambiar factura
              </UButton>
            </template>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="edit.show = false">
              Cancelar
            </UButton>
            <UButton color="primary" :loading="saving" @click="save">
              Guardar
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- MODAL: cambiar factura conciliada -->
      <UModal
        v-model:open="facturaModal.show"
        title="Selecciona la nueva factura (Trade / Log, pagadas)"
        :ui="{ content: 'max-w-6xl' }"
      >
        <template #body>
          <UInput
            v-model="facturaModal.search"
            icon="i-mdi-magnify"
            placeholder="Buscar por folio, referencia o concepto…"
            class="w-full mb-2"
          />
          <div class="text-xs text-muted mb-2 flex items-center gap-1">
            <UIcon name="i-mdi-cursor-default-click" class="size-3.5" />
            Haz clic en una factura para seleccionarla.
          </div>

          <div class="max-h-[60vh] overflow-y-auto">
            <UTable
              :data="facturasPagina"
              :columns="facturaColumns"
              :loading="facturaModal.loading"
              class="text-xs"
              :ui="{ tr: 'cursor-pointer' }"
              @select="(_e, row) => onRowFacturaEdit(row)"
            >
              <template #card_code-cell="{ row }">
                <UBadge size="sm" variant="subtle" :color="row.original.card_code === 'P0148' ? 'primary' : 'info'">
                  {{ row.original.card_code === 'P0148' ? 'Trade' : 'Log' }}
                </UBadge>
              </template>
              <template #fecha-cell="{ row }">
                <span class="text-muted block truncate">{{ fmtDate(row.original.fecha) }}</span>
              </template>
              <template #concepto-cell="{ row }">
                <span :title="row.original.concepto" class="block truncate">{{ row.original.concepto || '—' }}</span>
              </template>
              <template #subtotal-cell="{ row }">
                <span class="whitespace-nowrap">{{ money(row.original.subtotal) }}</span>
              </template>
              <template #abonado-cell="{ row }">
                <span class="whitespace-nowrap" :class="row.original.abonado > 0 ? 'text-success' : 'text-muted'">
                  {{ money(row.original.abonado) }}
                </span>
              </template>
              <template #pendiente-cell="{ row }">
                <strong class="whitespace-nowrap">{{ money(row.original.subtotal - row.original.abonado) }}</strong>
              </template>
              <template #empty>
                <div class="text-center text-muted py-8">
                  Sin facturas.
                </div>
              </template>
            </UTable>
          </div>

          <div v-if="facturasFiltradas.length > FACTURA_PAGE_SIZE" class="flex justify-center pt-3">
            <UPagination
              v-model:page="facturaPage"
              :items-per-page="FACTURA_PAGE_SIZE"
              :total="facturasFiltradas.length"
            />
          </div>
        </template>
      </UModal>

      <!-- ELIMINAR -->
      <UModal v-model:open="del.show" title="¿Eliminar operación?" :ui="{ content: 'max-w-md' }">
        <template #body>
          <div class="text-center">
            <UAvatar icon="i-mdi-delete-alert" size="xl" class="bg-error/10 text-error mb-3" />
            <p class="text-muted">
              Se eliminará la operación #{{ del.item?.id }} de forma permanente. Si tiene conciliación de
              factura, también se quitará.
            </p>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="del.show = false">
              Cancelar
            </UButton>
            <UButton color="error" :loading="deleting" @click="confirmDelete">
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* El encabezado de la tabla se queda fijo arriba al hacer scroll de la página.
   Se fija con CSS directo para no depender de qué clases de Nuxt UI ganen; los
   contenedores que lo envuelven van en overflow-visible para no atrapar el
   sticky (si no, el encabezado se pega dentro de un elemento que se va con el
   scroll y desaparece). */
.tabla-mayor :deep(thead) {
  position: sticky;
  top: 0;
  z-index: 20;
}
</style>
