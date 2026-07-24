<script setup>
// Caja Chica - Operaciones (tesorería).
// Migrado desde views/tesoreria/CajaChica.vue (Vuetify 3).
// La lógica de negocio (API, cálculos, validaciones, formatos) se conserva.
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { useAuthStore } from '~/stores/auth'
import axios from '~/utils/axios'

const authStore = useAuthStore()
const toast = useToast()

// Equivalente a `smAndDown` de Vuetify (< 960px aprox).
const breakpoints = useBreakpoints(breakpointsTailwind)
const smAndDown = breakpoints.smaller('lg')

// Recarga completa de datos (usada por el botón de refrescar y el pull-to-refresh)
const reloadAll = async () => {
  await Promise.all([fetchOperations(), fetchKpis(), fetchCatalogos()])
}

// --- Pull to refresh (solo táctil; en desktop no hace nada) ---
const ptr = ref({ pulling: false, dist: 0, refreshing: false })
let ptrStartY = null
const PTR_MAX = 90, PTR_THRESHOLD = 65
const onTouchStart = (e) => {
  ptrStartY = (window.scrollY <= 0 && !ptr.value.refreshing) ? e.touches[0].clientY : null
}
const onTouchMove = (e) => {
  if (ptrStartY == null || ptr.value.refreshing) return
  const dy = e.touches[0].clientY - ptrStartY
  if (dy > 0 && window.scrollY <= 0) {
    ptr.value.pulling = true
    ptr.value.dist = Math.min(dy * 0.5, PTR_MAX)
  } else {
    ptr.value.pulling = false
    ptr.value.dist = 0
  }
}
const onTouchEnd = async () => {
  if (ptr.value.pulling && ptr.value.dist >= PTR_THRESHOLD && !ptr.value.refreshing) {
    ptr.value.refreshing = true
    ptr.value.dist = 50
    try { await reloadAll() } finally { ptr.value.refreshing = false }
  }
  ptr.value.pulling = false
  ptr.value.dist = 0
  ptrStartY = null
}

const dialog = ref({ show: false, type: 'ingreso' })
const loading = ref(false)

// Listas Dinámicas
const sobresList = ref([])
const sobresFull = ref([]) // [{ id, nombre, saldo, ... }] para consultar saldo
const categoriasFull = ref([]) // [{ nombre, subcategorias: [{ nombre, es_manual }] }]

const fetchCatalogos = async () => {
  try {
    const [resSobres, resCats] = await Promise.all([
      axios.get('/tesoreria/sobres'),
      axios.get('/tesoreria/categorias')
    ])

    sobresList.value = resSobres.data.map(s => s.nombre)
    sobresFull.value = resSobres.data
    categoriasFull.value = resCats.data
  } catch (e) {
    console.error('Error cargando catálogos', e)
  }
}

// Modelo para el formulario
const editedItem = ref({
  monto: null,
  concepto: '',
  sobreOrigen: null,
  sobreDestino: null,
  categoria: null,
  subcategoria: null,
  subcategoriaManual: ''
})

// --- Categoría / Subcategoría (solo egresos) ---
const reqRule = v => (v !== null && v !== undefined && String(v).trim() !== '') || 'Requerido'

// --- Saldo del sobre y regla: los sobres nunca pueden quedar en negativo ---
const saldoSobre = (nombre) => {
  const s = sobresFull.value.find(x => x.nombre === nombre)
  return s ? Number(s.saldo) : 0
}
const montoNum = computed(() => Number(editedItem.value.monto) || 0)
// El sobre de ORIGEN (egreso / traspaso) es el que puede quedar en negativo.
const sobreOrigenSel = computed(() =>
  (dialog.value.type === 'egreso' || dialog.value.type === 'traspaso') ? editedItem.value.sobreOrigen : null)
const saldoOrigen = computed(() => sobreOrigenSel.value ? saldoSobre(sobreOrigenSel.value) : 0)
const excedeSaldo = computed(() => !!sobreOrigenSel.value && montoNum.value > saldoOrigen.value)

// --- Modal de desglose de saldos (solo sobres con movimientos) ---
const saldosDialog = ref(false)
const openSaldos = () => { saldosDialog.value = true }
const saldosPreview = computed(() => {
  return sobresFull.value.map((s) => {
    const movs = transactions.value.filter(t => t.sobre_origen === s.nombre || t.sobre_destino === s.nombre)
    if (!movs.length) return null
    const last = movs.reduce((a, b) => (new Date(a.fecha) >= new Date(b.fecha) ? a : b))
    return { nombre: s.nombre, saldo: Number(s.saldo), ultimaFecha: last.fecha, ultimoTipo: last.tipo }
  }).filter(Boolean).sort((a, b) => Number(b.saldo) - Number(a.saldo))
})

// Subcategorías de la categoría elegida
const subcatsForSelected = computed(() => {
  const c = categoriasFull.value.find(x => x.nombre === editedItem.value.categoria)
  return c?.subcategorias || []
})

// ¿La subcategoría elegida es de captura manual?
const isManualSub = computed(() => {
  const s = subcatsForSelected.value.find(x => x.nombre === editedItem.value.subcategoria)
  return !!s?.es_manual
})

const onCategoriaChange = () => {
  editedItem.value.subcategoria = null
  editedItem.value.subcategoriaManual = ''
}
const onSubcatChange = () => {
  if (!isManualSub.value) editedItem.value.subcategoriaManual = ''
}

// --- Ingresos: tipos y selección de factura de proveedor (SAP) ---
const tiposIngreso = ['Abono de Deudor', 'Cheque', 'Caja Chica', 'Préstamos']
const modosAbono = ['Factura', 'Manual']

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

// Búsqueda del modal de facturas (v-data-table :search se hacía solo en Vuetify)
const facturasFiltradas = computed(() => {
  const q = facturaModal.value.search.trim().toLowerCase()
  if (!q) return facturaModal.value.items
  return facturaModal.value.items.filter(f =>
    [f.folio_sap, f.numatcard, f.concepto, f.card_name]
      .map(x => String(x ?? '').toLowerCase()).join(' ').includes(q))
})
const facturaPage = ref(1)
const FACTURA_PAGE_SIZE = 10
const facturasPagina = computed(() => {
  const start = (facturaPage.value - 1) * FACTURA_PAGE_SIZE
  return facturasFiltradas.value.slice(start, start + FACTURA_PAGE_SIZE)
})
watch(() => facturaModal.value.search, () => { facturaPage.value = 1 })

const onTipoIngresoChange = (t) => {
  editedItem.value.factura = null
  editedItem.value.numCheque = ''
  editedItem.value.origenIngreso = ''
  editedItem.value.modoAbono = 'Factura'
  // El sobre siempre es manual; solo Abono de Deudor trae "Sergio" por default.
  editedItem.value.sobreDestino = (t === 'Abono de Deudor') ? 'Sergio' : null
}
const onModoAbonoChange = () => {
  editedItem.value.factura = null
  editedItem.value.origenIngreso = ''
}

const openFacturaModal = async () => {
  facturaModal.value.show = true
  facturaModal.value.loading = true
  facturaPage.value = 1
  try {
    const r = await axios.get('/tesoreria/sap/facturas-proveedor')
    facturaModal.value.items = r.data.map(f => ({ ...f, pendiente: Number(f.subtotal) - Number(f.abonado || 0) }))
  } catch (e) {
    console.error('Error cargando facturas SAP', e)
    toast.add({ title: 'Error al cargar las facturas de proveedor de SAP', color: 'error' })
  } finally {
    facturaModal.value.loading = false
  }
}

const selectFactura = (f) => {
  if (!f) return
  const row = f.raw || f
  editedItem.value.factura = row
  const pendiente = Number(row.subtotal) - Number(row.abonado || 0)
  editedItem.value.monto = pendiente > 0 ? pendiente : Number(row.subtotal)
  if (!editedItem.value.concepto) editedItem.value.concepto = `Abono deudor - Folio ${row.folio_sap}`
  facturaModal.value.show = false
}

// ARRAY VACÍO: Se llenará desde la BD
const transactions = ref([])

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el contenido largo se recorta con elipsis en vez de
// ensanchar la tabla. Los pesos suman 100%.
const columns = [
  { key: 'fecha', title: 'Fecha', w: 'w-[11%]' },
  { key: 'tipo', title: 'Tipo', w: 'w-[8%]' },
  { key: 'concepto', title: 'Concepto', w: 'w-[17%]' },
  { key: 'sobre_display', title: 'Sobre / Ruta', w: 'w-[12%]' },
  { key: 'categoria', title: 'Categoría', w: 'w-[12%]' },
  { key: 'monto', title: 'Monto Op.', w: 'w-[9%]', align: 'end' },
  { key: 'ingreso', title: 'Ingreso', w: 'w-[8%]', align: 'end' },
  { key: 'egreso', title: 'Egreso', w: 'w-[8%]', align: 'end' },
  { key: 'saldo', title: 'Saldo', w: 'w-[9%]', align: 'end' },
  { key: 'usuario', title: 'Usuario', w: 'w-[6%]' }
].map(d => ({
  accessorKey: d.key,
  header: d.title,
  meta: {
    class: {
      // El ancho se declara en el th; con `table-fixed` el td lo hereda.
      th: [d.w, 'px-2', d.align === 'end' ? 'text-right' : ''].filter(Boolean).join(' '),
      // `truncate` recorta con elipsis en lugar de ensanchar la columna.
      td: ['px-2 truncate', d.align === 'end' ? 'text-right' : ''].filter(Boolean).join(' ')
    }
  }
}))

// --- Filtro de periodo (año + meses) ---
// Se comparte con el resto de tesorería para que la experiencia sea la misma.
// El endpoint devuelve el histórico completo (miles de operaciones); acotar el
// periodo por omisión al mes en curso evita pintar todo de golpe.
const {
  periodo,
  MESES,
  aniosDisponibles,
  enPeriodo,
  periodoEsPredeterminado,
  limpiarPeriodo,
  etiquetaMes
} = useFiltroPeriodo(transactions, 'fecha')

// Búsqueda global del historial.
const histSearch = ref('')

// Filtros de catálogo de la barra superior. Todos son multi-selección y un
// arreglo vacío significa "sin filtro" (equivale a Todos), así que siempre
// existe la opción de no seleccionar nada.
const histTop = ref({ tipo: [], sobre: [], categoria: [], usuario: [] })

// Filtros por columna (popovers de encabezado). Se conservan y se SUMAN a los
// de la barra superior: ambos conjuntos se aplican en conjunción.
const histFilters = ref({ tipo: null, concepto: '', sobre_display: '', categoria: '', usuario: '' })
const tiposMovimiento = ['Ingreso', 'Egreso', 'Traspaso']

// Las opciones se derivan de los datos ya cargados, no de un catálogo fijo, así
// que sólo se ofrece lo que realmente aparece en el historial.
const opcionesUnicas = selector => [...new Set(
  transactions.value.map(selector).filter(v => v && v !== '-' && v !== '—')
)].sort()
const sobreOptions = computed(() => opcionesUnicas(t => t.sobre_display))
const categoriaOptions = computed(() => opcionesUnicas(t => t.categoria))
const usuarioOptions = computed(() => opcionesUnicas(t => t.usuario))

// Un chip por cada valor seleccionado, de cualquier filtro de la barra.
const filtrosActivos = computed(() => {
  const chips = []
  const agregar = (campo, valores, etiqueta = v => v) => {
    (valores || []).forEach(v => chips.push({ campo, valor: v, texto: etiqueta(v) }))
  }
  // Con "todo el histórico" el mes no aplica, así que no se muestra como chip.
  if (!periodo.value.historico) agregar('mes', periodo.value.meses, etiquetaMes)
  agregar('tipo', histTop.value.tipo)
  agregar('sobre', histTop.value.sobre)
  agregar('categoria', histTop.value.categoria)
  agregar('usuario', histTop.value.usuario)
  return chips
})

const quitarFiltro = (campo, valor) => {
  if (campo === 'mes') {
    periodo.value.meses = periodo.value.meses.filter(v => v !== valor)
    return
  }
  histTop.value[campo] = histTop.value[campo].filter(v => v !== valor)
}

// Hay filtros activos si se escribió una búsqueda global, si algún filtro de la
// barra o de columna tiene valor, o si el periodo dejó de ser el predeterminado
// (el periodo por omisión es el estado normal de la pantalla, no un filtro).
const hayFiltrosHist = computed(() =>
  !!histSearch.value.trim()
  || Object.values(histFilters.value).some(v => !!v)
  || Object.values(histTop.value).some(v => v.length > 0)
  || !periodoEsPredeterminado.value)

const limpiarFiltrosHist = () => {
  histSearch.value = ''
  histFilters.value = { tipo: null, concepto: '', sobre_display: '', categoria: '', usuario: '' }
  histTop.value = { tipo: [], sobre: [], categoria: [], usuario: [] }
  limpiarPeriodo()
}
const historialFiltrado = computed(() => {
  const q = histSearch.value.trim().toLowerCase()
  const f = histFilters.value
  const top = histTop.value
  const inc = (val, term) => String(val ?? '').toLowerCase().includes(String(term).toLowerCase())
  return transactionsWithBalance.value.filter((t) => {
    if (!enPeriodo(t)) return false

    // Barra superior (multi-selección): arreglo vacío = sin filtro.
    if (top.tipo.length && !top.tipo.includes(t.tipo)) return false
    if (top.sobre.length && !top.sobre.includes(t.sobre_display)) return false
    if (top.categoria.length && !top.categoria.includes(t.categoria)) return false
    if (top.usuario.length && !top.usuario.includes(t.usuario)) return false

    // Filtros por columna
    if (f.tipo && t.tipo !== f.tipo) return false
    if (f.concepto && !inc(t.concepto, f.concepto)) return false
    if (f.sobre_display && !inc(t.sobre_display, f.sobre_display)) return false
    if (f.categoria && !inc(t.categoria, f.categoria)) return false
    if (f.usuario && !inc(t.usuario, f.usuario)) return false
    if (q) {
      const hay = [t.concepto, t.tipo, t.sobre_display, t.categoria, t.subcategoria, t.usuario, formatDate(t.fecha)]
        .map(x => String(x ?? '').toLowerCase()).join(' ')
      if (!hay.includes(q)) return false
    }
    return true
  })
})

// --- API: CARGAR DATOS ---
const fetchOperations = async () => {
  try {
    loading.value = true
    const response = await axios.get('/tesoreria/operaciones')

    transactions.value = response.data.map(item => ({
      id: item.id || item.ID,
      fecha: item.fecha || item.Fecha || item.created_at,
      concepto: item.concepto || item.Concepto,
      tipo: item.tipo || item.Tipo,
      ingreso: parseFloat(item.ingreso || item.Ingreso || 0),
      egreso: parseFloat(item.egreso || item.Egreso || 0),
      monto: parseFloat(item.monto || item.Monto || 0),
      categoria: item.categoria || item.Categoria || '-',
      subcategoria: item.subcategoria || item.Subcategoria || null,
      sobre_origen: item.sobre_origen || item.SobreOrigen,
      sobre_destino: item.sobre_destino || item.SobreDestino,
      usuario: item.usuario || item.Usuario,
      sobre_display: (item.tipo === 'Traspaso' || item.Tipo === 'Traspaso')
        ? `${item.sobre_origen || '-'} → ${item.sobre_destino || '-'}`
        : (item.sobre_destino || item.sobre_origen || '-')
    }))
  } catch (error) {
    console.error('Error cargando operaciones:', error)
  } finally {
    loading.value = false
  }
}

// --- Validación del formulario (equivalente a las reglas del v-form) ---
const formErrors = ref({})
const validateForm = () => {
  const e = {}
  const it = editedItem.value
  const req = v => reqRule(v) === true

  if (!it.monto) e.monto = 'Monto es requerido'
  if (!it.concepto) e.concepto = 'Concepto es requerido'

  if (dialog.value.type === 'ingreso') {
    const t = it.tipoIngreso
    if (t === 'Cheque' && !req(it.numCheque)) e.numCheque = 'Requerido'
    const usaOrigen = (t === 'Caja Chica' || t === 'Préstamos'
      || (t === 'Abono de Deudor' && it.modoAbono === 'Manual'))
    if (usaOrigen && !req(it.origenIngreso)) e.origenIngreso = 'Requerido'
    if (!req(it.sobreDestino)) e.sobreDestino = 'Requerido'
  }

  if (dialog.value.type === 'egreso') {
    if (!req(it.sobreOrigen)) e.sobreOrigen = 'Requerido'
    if (!req(it.categoria)) e.categoria = 'Requerido'
    if (subcatsForSelected.value.length && !req(it.subcategoria)) e.subcategoria = 'Requerido'
    if (isManualSub.value && !req(it.subcategoriaManual)) e.subcategoriaManual = 'Requerido'
  }

  if (dialog.value.type === 'traspaso') {
    if (!req(it.sobreOrigen)) e.sobreOrigen = 'Requerido'
    if (!req(it.sobreDestino)) e.sobreDestino = 'Requerido'
  }

  formErrors.value = e
  return Object.keys(e).length === 0
}

// --- API: GUARDAR DATOS ---
const saveOperation = async () => {
  if (!validateForm()) return

  const esIngreso = dialog.value.type === 'ingreso'
  const esEgreso = dialog.value.type === 'egreso'

  // Abono de Deudor por Factura exige una factura seleccionada
  if (esIngreso && editedItem.value.tipoIngreso === 'Abono de Deudor'
    && editedItem.value.modoAbono === 'Factura' && !editedItem.value.factura) {
    toast.add({ title: 'Selecciona una factura de proveedor de SAP.', color: 'error' })
    return
  }

  // Regla: ningún sobre puede quedar en negativo (aplica a egreso y traspaso).
  if (excedeSaldo.value) {
    toast.add({
      title: `El sobre "${editedItem.value.sobreOrigen}" no puede quedar en negativo.`,
      description: `Saldo disponible: ${formatCurrency(saldoOrigen.value)} · Monto solicitado: ${formatCurrency(montoNum.value)}`,
      color: 'error'
    })
    return
  }

  try {
    const subcatFinal = isManualSub.value ? editedItem.value.subcategoriaManual : editedItem.value.subcategoria
    const payload = {
      monto: parseFloat(editedItem.value.monto),
      concepto: editedItem.value.concepto,
      usuario: authStore.user?.name || 'Usuario',
      tipo: esIngreso ? 'Ingreso' : (esEgreso ? 'Egreso' : 'Traspaso'),
      // Categoría/subcategoría solo aplican a egresos
      categoria: esEgreso ? (editedItem.value.categoria || null) : null,
      subcategoria: esEgreso ? (subcatFinal || null) : null,
      sobreOrigen: (esEgreso || dialog.value.type === 'traspaso') ? editedItem.value.sobreOrigen : null,
      sobreDestino: (esIngreso || dialog.value.type === 'traspaso') ? editedItem.value.sobreDestino : null
    }

    if (esIngreso) {
      const t = editedItem.value.tipoIngreso
      payload.tipoIngreso = t
      if (t === 'Cheque') payload.numCheque = editedItem.value.numCheque
      const usaOrigen = (t === 'Caja Chica' || t === 'Préstamos'
        || (t === 'Abono de Deudor' && editedItem.value.modoAbono === 'Manual'))
      if (usaOrigen) payload.origenIngreso = editedItem.value.origenIngreso
      if (t === 'Abono de Deudor' && editedItem.value.modoAbono === 'Factura' && editedItem.value.factura) {
        const f = editedItem.value.factura
        payload.conciliacion = {
          sap_docentry: f.docentry,
          sap_docnum: f.folio_sap,
          numatcard: f.numatcard,
          card_code: f.card_code,
          card_name: f.card_name,
          subtotal: f.subtotal,
          concepto: f.concepto,
          monto_abonado: parseFloat(editedItem.value.monto)
        }
      }
    }

    await axios.post('/tesoreria/operaciones', payload)

    await fetchOperations()
    fetchKpis()
    fetchCatalogos() // refresca los saldos de los sobres
    dialog.value.show = false
    toast.add({ title: 'Operación guardada', color: 'success' })
  } catch (error) {
    console.error('Error guardando:', error)
    toast.add({ title: error.response?.data?.message || 'Error al guardar operación', color: 'error' })
  }
}

// --- COMPUTED LOGIC ---

const transactionsWithBalance = computed(() => {
  let saldoAcumulado = 0
  const sorted = [...transactions.value].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

  return sorted.map((t) => {
    saldoAcumulado = saldoAcumulado + t.ingreso - t.egreso
    return { ...t, saldo: saldoAcumulado }
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
})

const globalBalance = computed(() => {
  if (transactionsWithBalance.value.length === 0) return 0
  return transactionsWithBalance.value[0].saldo
})

// KPIs de flujo calculados en el backend (hoy / mes / año).
const kpis = ref({ ingresoHoy: 0, egresoHoy: 0, ingresoMes: 0, egresoMes: 0, ingresoAnio: 0, egresoAnio: 0 })
const fetchKpis = async () => {
  try {
    const r = await axios.get('/tesoreria/kpis')
    kpis.value = r.data
  } catch (e) {
    console.error('Error cargando KPIs', e)
  }
}
// Distingue la primera carga (mostramos esqueletos) de las recargas posteriores
// (mantenemos los datos visibles para que la pantalla no parpadee).
const cargaInicial = computed(() => loading.value && !transactions.value.length)

const kpiCards = computed(() => [
  { label: 'Ingresos Hoy', value: kpis.value.ingresoHoy, type: 'in' },
  { label: 'Egresos Hoy', value: kpis.value.egresoHoy, type: 'out' },
  { label: 'Ingreso Mensual', value: kpis.value.ingresoMes, type: 'in' },
  { label: 'Egreso Mensual', value: kpis.value.egresoMes, type: 'out' },
  { label: 'Ingreso Anual', value: kpis.value.ingresoAnio, type: 'in' },
  { label: 'Egreso Anual', value: kpis.value.egresoAnio, type: 'out' }
])
// En móvil: mostrar solo "hoy" y desplegar el resto con "Ver más".
const showAllKpis = ref(false)
const kpiCardsVisibles = computed(() =>
  (smAndDown.value && !showAllKpis.value) ? kpiCards.value.slice(0, 2) : kpiCards.value)

// Tarjetas de acción (data-driven)
const accionCards = [
  { tipo: 'ingreso', label: 'Ingreso', sub: 'Recibir dinero', icon: 'i-mdi-cash-plus', color: 'success' },
  { tipo: 'egreso', label: 'Egreso', sub: 'Gasto o pago', icon: 'i-mdi-cash-minus', color: 'error' },
  { tipo: 'traspaso', label: 'Traspaso', sub: 'Mover entre sobres', icon: 'i-mdi-swap-horizontal', color: 'warning' },
  { tipo: 'saldos', label: 'Saldos', sub: 'Ver desglose', icon: 'i-mdi-email-outline', color: 'info' }
]
const accionBorde = {
  success: 'border-b-4 border-b-success',
  error: 'border-b-4 border-b-error',
  warning: 'border-b-4 border-b-warning',
  info: 'border-b-4 border-b-info'
}

const dialogTitle = computed(() => {
  if (dialog.value.type === 'ingreso') return 'Registrar Ingreso'
  if (dialog.value.type === 'egreso') return 'Registrar Egreso'
  return 'Traspaso entre Sobres'
})

const dialogColor = computed(() => {
  if (dialog.value.type === 'ingreso') return 'success'
  if (dialog.value.type === 'egreso') return 'error'
  return 'warning'
})

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  return new Date(dateString).toLocaleDateString('es-MX', options)
}

const getTypeColor = (type) => {
  if (!type) return 'neutral'
  const t = type.toLowerCase()
  if (t === 'ingreso') return 'success'
  if (t === 'egreso') return 'error'
  return 'warning'
}

const openDialog = (type) => {
  dialog.value.type = type
  formErrors.value = {}
  editedItem.value = {
    monto: null, concepto: '', sobreOrigen: null, sobreDestino: null,
    categoria: null, subcategoria: null, subcategoriaManual: '',
    tipoIngreso: 'Abono de Deudor', modoAbono: 'Factura',
    origenIngreso: '', numCheque: '', factura: null
  }
  if (type === 'ingreso') editedItem.value.sobreDestino = 'Sergio'
  dialog.value.show = true
}

// --- Barra de acciones que se encoge al hacer scroll -----------------------
// Al bajar en la página, las tarjetas de acción se pegan arriba y se compactan.
// El estado se activa pasado un umbral y se libera antes de soltarlo, para que
// no parpadee justo en el borde (histéresis).
const compacto = ref(false)
const barraRef = ref(null)       // barra de acciones pegada arriba
const centinelaRef = ref(null)   // marca el tope del contenido
let ro = null                     // observa el alto de la barra
let io = null                     // detecta cuándo ya hiciste scroll

// Publica el alto real de la barra como --barra-h en el <html>, para que el
// encabezado de la tabla (sticky) se ancle JUSTO debajo de la barra y no quede
// tapado. Se recalcula solo cuando la barra cambia de tamaño (al compactarse).
const medirBarra = () => {
  if (barraRef.value) {
    document.documentElement.style.setProperty('--barra-h', barraRef.value.offsetHeight + 'px')
  }
}

onMounted(() => {
  fetchOperations()
  fetchCatalogos()
  fetchKpis()
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchend', onTouchEnd)

  nextTick(() => {
    // La barra se compacta cuando el centinela (hasta arriba del contenido)
    // sale de la vista al hacer scroll. Al observar contra el viewport no hay
    // que saber cuál elemento scrollea: funciona sin importar el layout.
    if (centinelaRef.value) {
      io = new IntersectionObserver(
        ([e]) => { compacto.value = !e.isIntersecting },
        { threshold: 0 }
      )
      io.observe(centinelaRef.value)
    }
    if (barraRef.value) {
      ro = new ResizeObserver(medirBarra)
      ro.observe(barraRef.value)
    }
    medirBarra()
  })
})
onUnmounted(() => {
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
  ro?.disconnect()
  io?.disconnect()
})
</script>

<template>
  <!-- La página scrollea (escritorio y móvil). La barra de acciones se queda
       pegada arriba y se compacta al bajar. El pull-to-refresh de móvil sigue
       dependiendo del scroll de window. -->
  <UDashboardPanel id="tesoreria-caja-chica">
    <template #header>
      <UDashboardNavbar title="Caja Chica - Operaciones">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge color="primary" variant="subtle" size="lg">
            Saldo: {{ formatCurrency(globalBalance) }}
          </UBadge>
          <UTooltip text="Recargar">
            <UButton
              icon="i-mdi-refresh"
              color="neutral"
              variant="ghost"
              square
              :loading="loading"
              @click="reloadAll"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Centinela: cuando sale de la vista al hacer scroll, la barra se compacta. -->
      <div ref="centinelaRef" class="h-px w-full" aria-hidden="true" />

      <!-- Pull to refresh (móvil) -->
      <div
        v-if="ptr.pulling || ptr.refreshing"
        class="flex items-center justify-center overflow-hidden transition-[height] duration-150 shrink-0"
        :style="{ height: (ptr.refreshing ? 50 : ptr.dist) + 'px' }"
      >
        <UIcon
          v-if="ptr.refreshing"
          name="i-lucide-loader-circle"
          class="size-6 animate-spin text-primary"
        />
        <UIcon
          v-else
          name="i-mdi-arrow-down"
          class="size-6 text-primary"
          :style="{ transform: 'rotate(' + (ptr.dist / PTR_MAX * 180) + 'deg)' }"
        />
      </div>

      <!-- Tarjetas de acción: pegadas arriba y compactas al hacer scroll.
           Fondo TOTALMENTE opaco para que nada se transparente por detrás, y
           una sombra/borde que aparece al compactarse para separarla del contenido.
           El encabezado de la tabla se pega justo debajo (ver --barra-h). -->
      <div
        ref="barraRef"
        class="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-3 mb-4 bg-default transition-shadow duration-300"
        :class="compacto ? 'shadow-md border-b border-default' : ''"
      >
        <div class="grid grid-cols-12 gap-4">
          <div
            v-for="c in accionCards"
            :key="c.tipo"
            class="col-span-6 md:col-span-3"
          >
            <UCard
              class="h-full cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
              :class="accionBorde[c.color]"
              :ui="{ body: (smAndDown || compacto) ? 'p-3 transition-all duration-300' : 'p-5 transition-all duration-300' }"
              @click="c.tipo === 'saldos' ? openSaldos() : openDialog(c.tipo)"
            >
              <div class="flex items-center" :class="(smAndDown || compacto) ? 'gap-3' : 'gap-4'">
                <UButton
                  :icon="c.icon"
                  :color="c.color"
                  variant="solid"
                  square
                  :size="(smAndDown || compacto) ? 'sm' : 'md'"
                  class="pointer-events-none"
                />
                <div class="min-w-0">
                  <h2
                    class="font-bold text-highlighted truncate transition-all duration-300"
                    :class="(smAndDown || compacto) ? 'text-base' : 'text-2xl'"
                  >
                    {{ c.label }}
                  </h2>
                  <p
                    v-if="!smAndDown"
                    class="text-muted text-sm overflow-hidden transition-all duration-300"
                    :class="compacto ? 'max-h-0 opacity-0 mt-0' : 'max-h-8 opacity-100 mt-1'"
                  >
                    {{ c.sub }}
                  </p>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-12 gap-3 lg:shrink-0">
        <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al recargar -->
        <div
          v-for="i in (cargaInicial ? kpiCardsVisibles.length : 0)"
          :key="`kpi-skel-${i}`"
          class="col-span-6 sm:col-span-4 md:col-span-2"
        >
          <UCard :ui="{ body: 'p-4 text-center' }" class="border-b-4 border-b-default">
            <USkeleton class="size-8 rounded-full mx-auto mb-2" />
            <USkeleton class="h-3 w-20 mx-auto mb-2" />
            <USkeleton class="h-5 w-24 mx-auto" />
          </UCard>
        </div>

        <div
          v-for="k in (cargaInicial ? [] : kpiCardsVisibles)"
          :key="k.label"
          class="col-span-6 sm:col-span-4 md:col-span-2"
        >
          <UCard
            :ui="{ body: 'p-4 text-center' }"
            :class="k.type === 'in' ? 'border-b-4 border-b-success' : 'border-b-4 border-b-error'"
          >
            <UAvatar
              :icon="k.type === 'in' ? 'i-mdi-trending-up' : 'i-mdi-trending-down'"
              size="md"
              class="mb-2"
              :class="k.type === 'in' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'"
            />
            <p class="text-xs text-muted mb-1 font-medium">
              {{ k.label }}
            </p>
            <div
              class="text-lg font-bold whitespace-nowrap"
              :class="k.type === 'in' ? 'text-success' : 'text-error'"
            >
              {{ formatCurrency(k.value) }}
            </div>
          </UCard>
        </div>
      </div>

      <!-- Ver más KPIs (solo móvil) -->
      <div v-if="smAndDown" class="text-center my-2">
        <UButton
          variant="ghost"
          size="sm"
          color="primary"
          :trailing-icon="showAllKpis ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
          @click="showAllKpis = !showAllKpis"
        >
          {{ showAllKpis ? 'Ver menos' : 'Ver más indicadores' }}
        </UButton>
      </div>

      <!-- Historial -->
      <!-- La tarjeta crece con su contenido; el scroll es el de la página. -->
      <UCard
        class="mt-4"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <template #header>
          <div class="flex items-center flex-wrap gap-2">
            <UIcon name="i-mdi-history" class="size-5 text-primary" />
            <span class="font-semibold text-highlighted">Historial de Operaciones</span>
            <div class="flex-1" />
            <UBadge color="primary" variant="subtle">
              {{ historialFiltrado.length }} operaciones
            </UBadge>
          </div>
        </template>

        <!-- Barra de filtros superior: búsqueda global, rejilla de filtros y
             chips de lo que está activo. Misma experiencia que el pipeline. -->
        <div class="p-4 bg-elevated/30 border-b border-default lg:shrink-0">
          <UInput
            v-model="histSearch"
            icon="i-mdi-magnify"
            placeholder="Búsqueda rápida (concepto, sobre, categoría, usuario…)"
            size="lg"
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="histSearch" #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-circle-x"
                aria-label="Limpiar búsqueda"
                @click="histSearch = ''"
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
                v-model="histTop.tipo"
                :items="tiposMovimiento"
                multiple
                icon="i-mdi-swap-vertical"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Sobre / Ruta">
              <USelectMenu
                v-model="histTop.sobre"
                :items="sobreOptions"
                multiple
                icon="i-mdi-email-outline"
                placeholder="Todos"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Categoría">
              <USelectMenu
                v-model="histTop.categoria"
                :items="categoriaOptions"
                multiple
                icon="i-mdi-folder-outline"
                placeholder="Todas"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Usuario">
              <USelectMenu
                v-model="histTop.usuario"
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
          <div v-if="filtrosActivos.length || hayFiltrosHist" class="flex flex-wrap items-center gap-1 mt-3">
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
              v-if="hayFiltrosHist"
              color="neutral"
              variant="link"
              size="xs"
              label="Limpiar todo"
              icon="i-lucide-circle-x"
              @click="limpiarFiltrosHist"
            />
          </div>

          <p v-else class="text-xs text-muted mt-3">
            Sin filtros: se muestra el año {{ periodo.anio }} completo.
          </p>
        </div>

        <!-- Móvil: lista de tarjetas -->
        <div v-if="smAndDown" class="p-3">
          <!-- Vacío: distingue "no hay nada" de "los filtros no dejan ver nada". -->
          <div v-if="!historialFiltrado.length" class="text-center py-8">
            <p class="font-semibold text-highlighted mb-1">
              {{ hayFiltrosHist ? 'Ninguna operación coincide con los filtros' : 'Aún no hay operaciones' }}
            </p>
            <p class="text-sm text-muted mb-4">
              {{ hayFiltrosHist
                ? 'Prueba quitando algún filtro o amplía el periodo.'
                : 'Todavía no se ha registrado ningún ingreso, egreso ni traspaso.' }}
            </p>
            <UButton
              v-if="hayFiltrosHist"
              label="Limpiar filtros"
              icon="i-lucide-circle-x"
              color="neutral"
              variant="subtle"
              @click="limpiarFiltrosHist"
            />
          </div>
          <UCard
            v-for="t in historialFiltrado"
            :key="t.id"
            class="mb-2"
            :ui="{ body: 'py-3 px-4' }"
          >
            <div class="flex justify-between items-center mb-1">
              <UBadge
                :color="getTypeColor(t.tipo)"
                variant="subtle"
                size="sm"
                class="font-bold"
              >
                {{ t.tipo }}
              </UBadge>
              <span class="text-xs text-muted">{{ formatDate(t.fecha) }}</span>
            </div>
            <div class="font-medium">
              {{ t.concepto || '—' }}
            </div>
            <div class="text-xs text-muted mb-2">
              {{ t.sobre_display }}<span v-if="t.categoria && t.categoria !== '-'"> · {{ t.categoria }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span v-if="t.ingreso > 0" class="text-success font-bold">+{{ formatCurrency(t.ingreso) }}</span>
              <span v-else-if="t.egreso > 0" class="text-error font-bold">-{{ formatCurrency(t.egreso) }}</span>
              <span v-else class="text-muted font-bold">{{ formatCurrency(t.monto) }}</span>
              <span class="text-xs text-muted flex items-center gap-1">
                <UIcon name="i-mdi-account-outline" class="size-3.5" />{{ t.usuario || '—' }}
              </span>
            </div>
          </UCard>
        </div>

        <!-- Desktop: tabla -->
        <UTable
          v-else
          :data="historialFiltrado"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="text-xs tabla-historial"
          :ui="{
            base: 'table-fixed w-full',
            thead: 'z-20 shadow-sm',
            td: 'text-sm py-2',
            th: 'text-xs py-2 bg-default'
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
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-16 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
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
                  :name="hayFiltrosHist ? 'i-lucide-filter-x' : 'i-lucide-inbox'"
                  class="size-7 text-primary"
                />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                {{ hayFiltrosHist ? 'Ninguna operación coincide con los filtros' : 'Aún no hay operaciones' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltrosHist
                  ? 'Prueba quitando algún filtro, amplía el periodo o borra el texto de la búsqueda.'
                  : 'Todavía no se ha registrado ningún ingreso, egreso ni traspaso.' }}
              </p>

              <UButton
                v-if="hayFiltrosHist"
                label="Limpiar filtros"
                icon="i-lucide-circle-x"
                color="neutral"
                variant="subtle"
                @click="limpiarFiltrosHist"
              />
              <UButton
                v-else
                label="Recargar"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="subtle"
                @click="reloadAll"
              />
            </div>
          </template>

          <!-- Filtros por columna -->
          <template #tipo-header="{ column }">
            <div class="flex items-center gap-1 min-w-0">
              <span class="truncate">{{ column.columnDef.header }}</span>
              <UDropdownMenu
                :items="[
                  [{ label: 'Todos', onSelect: () => (histFilters.tipo = null) }],
                  tiposMovimiento.map(t => ({ label: t, onSelect: () => (histFilters.tipo = t) }))
                ]"
              >
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  class="shrink-0"
                  :color="histFilters.tipo ? 'primary' : 'neutral'"
                  square
                />
              </UDropdownMenu>
            </div>
          </template>

          <template #concepto-header="{ column }">
            <div class="flex items-center gap-1 min-w-0">
              <span class="truncate">{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  class="shrink-0"
                  :color="histFilters.concepto ? 'primary' : 'neutral'"
                  square
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="histFilters.concepto"
                      placeholder="Contiene…"
                      autofocus
                      class="w-full"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </template>

          <template #sobre_display-header="{ column }">
            <div class="flex items-center gap-1 min-w-0">
              <span class="truncate">{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  class="shrink-0"
                  :color="histFilters.sobre_display ? 'primary' : 'neutral'"
                  square
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="histFilters.sobre_display"
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
            <div class="flex items-center gap-1 min-w-0">
              <span class="truncate">{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  class="shrink-0"
                  :color="histFilters.categoria ? 'primary' : 'neutral'"
                  square
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="histFilters.categoria"
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
            <div class="flex items-center gap-1 min-w-0">
              <span class="truncate">{{ column.columnDef.header }}</span>
              <UPopover>
                <UButton
                  icon="i-mdi-filter-variant"
                  size="xs"
                  variant="ghost"
                  class="shrink-0"
                  :color="histFilters.usuario ? 'primary' : 'neutral'"
                  square
                />
                <template #content>
                  <div class="p-2 w-60">
                    <UInput
                      v-model="histFilters.usuario"
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
            <span class="block truncate text-muted" :title="formatDate(row.original.fecha)">{{ formatDate(row.original.fecha) }}</span>
          </template>
          <template #tipo-cell="{ row }">
            <UBadge
              :color="getTypeColor(row.original.tipo)"
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
          <template #sobre_display-cell="{ row }">
            <span :title="row.original.sobre_display" class="block truncate">{{ row.original.sobre_display }}</span>
          </template>
          <template #usuario-cell="{ row }">
            <span :title="row.original.usuario" class="block truncate">{{ row.original.usuario || '—' }}</span>
          </template>
          <template #categoria-cell="{ row }">
            <span
              class="block truncate"
              :title="(row.original.categoria && row.original.categoria !== '-' ? row.original.categoria : '') + (row.original.subcategoria ? ' / ' + row.original.subcategoria : '')"
            >
              {{ row.original.categoria && row.original.categoria !== '-' ? row.original.categoria : '—' }}<span v-if="row.original.subcategoria" class="text-muted"> / {{ row.original.subcategoria }}</span>
            </span>
          </template>
          <template #monto-cell="{ row }">
            <span class="font-bold whitespace-nowrap">{{ formatCurrency(row.original.monto) }}</span>
          </template>
          <template #ingreso-cell="{ row }">
            <span v-if="row.original.ingreso > 0" class="text-success font-bold whitespace-nowrap">+{{ formatCurrency(row.original.ingreso) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
          <template #egreso-cell="{ row }">
            <span v-if="row.original.egreso > 0" class="text-error font-bold whitespace-nowrap">-{{ formatCurrency(row.original.egreso) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
          <template #saldo-cell="{ row }">
            <strong class="text-primary whitespace-nowrap">{{ formatCurrency(row.original.saldo) }}</strong>
          </template>
        </UTable>
      </UCard>

      <!-- MODAL: captura de operación -->
      <UModal v-model:open="dialog.show" :title="dialogTitle" :ui="{ content: 'max-w-lg' }">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Monto ($)" required :error="formErrors.monto">
              <UInput v-model="editedItem.monto" type="number" class="w-full">
                <template #leading>
                  <span class="text-muted text-sm">$</span>
                </template>
              </UInput>
            </UFormField>

            <UFormField label="Concepto" required :error="formErrors.concepto">
              <UInput v-model="editedItem.concepto" class="w-full" />
            </UFormField>

            <template v-if="dialog.type === 'ingreso'">
              <div>
                <div class="text-xs text-muted mb-1">
                  Tipo de ingreso
                </div>
                <div class="flex flex-wrap gap-1">
                  <UButton
                    v-for="t in tiposIngreso"
                    :key="t"
                    size="sm"
                    :color="editedItem.tipoIngreso === t ? 'success' : 'neutral'"
                    :variant="editedItem.tipoIngreso === t ? 'solid' : 'outline'"
                    @click="editedItem.tipoIngreso = t; onTipoIngresoChange(t)"
                  >
                    {{ t }}
                  </UButton>
                </div>
              </div>

              <!-- Abono de Deudor: Factura (SAP) o Manual -->
              <div v-if="editedItem.tipoIngreso === 'Abono de Deudor'">
                <div class="flex gap-1 mb-3">
                  <UButton
                    v-for="m in modosAbono"
                    :key="m"
                    size="sm"
                    :color="editedItem.modoAbono === m ? 'primary' : 'neutral'"
                    :variant="editedItem.modoAbono === m ? 'solid' : 'outline'"
                    @click="editedItem.modoAbono = m; onModoAbonoChange()"
                  >
                    {{ m === 'Factura' ? 'Factura (SAP)' : 'Manual' }}
                  </UButton>
                </div>

                <template v-if="editedItem.modoAbono === 'Factura'">
                  <UButton
                    block
                    color="primary"
                    variant="soft"
                    icon="i-mdi-file-search-outline"
                    @click="openFacturaModal"
                  >
                    {{ editedItem.factura ? 'Cambiar factura' : 'Seleccionar factura de proveedor (SAP)' }}
                  </UButton>
                  <UAlert
                    v-if="editedItem.factura"
                    color="info"
                    variant="soft"
                    class="mt-2"
                  >
                    <template #description>
                      <div class="font-bold">
                        Folio {{ editedItem.factura.folio_sap }} · Ref: {{ editedItem.factura.numatcard || '—' }}
                      </div>
                      <div class="text-xs my-1">
                        {{ editedItem.factura.concepto || 'Sin concepto' }}
                      </div>
                      <div>
                        Valor: <strong>{{ formatCurrency(editedItem.factura.subtotal) }}</strong>
                        · Ya abonado: {{ formatCurrency(editedItem.factura.abonado) }}
                        · Pendiente: <strong>{{ formatCurrency(editedItem.factura.subtotal - editedItem.factura.abonado) }}</strong>
                      </div>
                    </template>
                  </UAlert>
                </template>

                <UFormField
                  v-else
                  label="Origen (captura libre)"
                  required
                  :error="formErrors.origenIngreso"
                >
                  <UInput v-model="editedItem.origenIngreso" icon="i-mdi-text" class="w-full" />
                </UFormField>
              </div>

              <!-- Cheque -->
              <UFormField
                v-if="editedItem.tipoIngreso === 'Cheque'"
                label="Número de cheque"
                required
                :error="formErrors.numCheque"
              >
                <UInput v-model="editedItem.numCheque" icon="i-mdi-checkbook" class="w-full" />
              </UFormField>

              <!-- Caja Chica / Préstamos -->
              <UFormField
                v-if="editedItem.tipoIngreso === 'Caja Chica' || editedItem.tipoIngreso === 'Préstamos'"
                label="Origen (captura libre)"
                required
                :error="formErrors.origenIngreso"
              >
                <UInput v-model="editedItem.origenIngreso" icon="i-mdi-text" class="w-full" />
              </UFormField>

              <!-- Sobre destino: SIEMPRE manual (default Sergio para Abono de Deudor) -->
              <UFormField label="Sobre destino" required :error="formErrors.sobreDestino">
                <USelectMenu
                  v-model="editedItem.sobreDestino"
                  :items="sobresList"
                  icon="i-mdi-email"
                  placeholder="Selecciona un sobre"
                  class="w-full"
                />
                <template #help>
                  <span v-if="editedItem.sobreDestino" class="flex items-center gap-1">
                    <UIcon name="i-mdi-wallet-outline" class="size-3.5" />
                    Saldo del sobre: {{ formatCurrency(saldoSobre(editedItem.sobreDestino)) }}
                  </span>
                </template>
              </UFormField>
            </template>

            <template v-if="dialog.type === 'egreso'">
              <UFormField label="Tomar del Sobre" required :error="formErrors.sobreOrigen">
                <USelectMenu
                  v-model="editedItem.sobreOrigen"
                  :items="sobresList"
                  icon="i-mdi-email-open"
                  placeholder="Selecciona un sobre"
                  class="w-full"
                />
              </UFormField>
              <div
                v-if="editedItem.sobreOrigen"
                class="text-xs flex items-center gap-1"
                :class="excedeSaldo ? 'text-error font-bold' : 'text-muted'"
              >
                <UIcon :name="excedeSaldo ? 'i-mdi-alert' : 'i-mdi-wallet-outline'" class="size-3.5" />
                Saldo del sobre: {{ formatCurrency(saldoOrigen) }}
                <span v-if="excedeSaldo"> — el sobre no puede quedar en negativo</span>
              </div>

              <UFormField label="Categoría" required :error="formErrors.categoria">
                <USelectMenu
                  v-model="editedItem.categoria"
                  :items="categoriasFull"
                  label-key="nombre"
                  value-key="nombre"
                  icon="i-mdi-folder-outline"
                  placeholder="Selecciona una categoría"
                  class="w-full"
                  @update:model-value="onCategoriaChange"
                />
              </UFormField>

              <UFormField
                v-if="subcatsForSelected.length"
                label="Subcategoría"
                required
                :error="formErrors.subcategoria"
              >
                <USelectMenu
                  v-model="editedItem.subcategoria"
                  :items="subcatsForSelected"
                  label-key="nombre"
                  value-key="nombre"
                  icon="i-mdi-file-tree"
                  placeholder="Selecciona una subcategoría"
                  class="w-full"
                  @update:model-value="onSubcatChange"
                />
              </UFormField>

              <UFormField
                v-if="isManualSub"
                label="Subcategoría (captura manual)"
                required
                :error="formErrors.subcategoriaManual"
              >
                <UInput v-model="editedItem.subcategoriaManual" icon="i-mdi-pencil" class="w-full" />
              </UFormField>
            </template>

            <template v-if="dialog.type === 'traspaso'">
              <UFormField label="Desde Sobre (Origen)" required :error="formErrors.sobreOrigen">
                <USelectMenu
                  v-model="editedItem.sobreOrigen"
                  :items="sobresList"
                  placeholder="Selecciona un sobre"
                  class="w-full"
                />
              </UFormField>
              <div
                v-if="editedItem.sobreOrigen"
                class="text-xs flex items-center gap-1"
                :class="excedeSaldo ? 'text-error font-bold' : 'text-muted'"
              >
                <UIcon :name="excedeSaldo ? 'i-mdi-alert' : 'i-mdi-wallet-outline'" class="size-3.5" />
                Saldo del sobre: {{ formatCurrency(saldoOrigen) }}
                <span v-if="excedeSaldo"> — el sobre no puede quedar en negativo</span>
              </div>

              <div class="flex justify-center">
                <UIcon name="i-mdi-arrow-down-bold" class="size-5 text-muted" />
              </div>

              <UFormField label="Hacia Sobre (Destino)" required :error="formErrors.sobreDestino">
                <USelectMenu
                  v-model="editedItem.sobreDestino"
                  :items="sobresList"
                  placeholder="Selecciona un sobre"
                  class="w-full"
                />
              </UFormField>
              <div v-if="editedItem.sobreDestino" class="text-xs text-muted flex items-center gap-1">
                <UIcon name="i-mdi-wallet-outline" class="size-3.5" />
                Saldo del sobre: {{ formatCurrency(saldoSobre(editedItem.sobreDestino)) }}
              </div>
            </template>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="dialog.show = false">
              Cancelar
            </UButton>
            <UButton :color="dialogColor" :disabled="excedeSaldo" @click="saveOperation">
              Guardar Operación
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- MODAL: desglose de saldos por sobre -->
      <UModal v-model:open="saldosDialog" title="Saldos por sobre" :ui="{ content: 'max-w-xl' }">
        <template #body>
          <div v-if="!saldosPreview.length" class="text-center text-muted py-8">
            <UIcon name="i-mdi-email-off-outline" class="size-12 mb-2" />
            <div>Aún no hay sobres con movimientos.</div>
          </div>
          <div v-else>
            <div
              v-for="(s, i) in saldosPreview"
              :key="s.nombre"
              class="flex items-center gap-3 py-3"
              :class="i < saldosPreview.length - 1 ? 'border-b border-default' : ''"
            >
              <UAvatar
                icon="i-mdi-email-outline"
                size="md"
                :class="s.saldo < 0 ? 'bg-error/10 text-error' : 'bg-info/10 text-info'"
              />
              <div class="flex-1 min-w-0">
                <div class="font-bold truncate">
                  {{ s.nombre }}
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <UBadge
                    :color="getTypeColor(s.ultimoTipo)"
                    variant="subtle"
                    size="sm"
                    class="font-bold"
                  >
                    {{ s.ultimoTipo }}
                  </UBadge>
                  <span class="text-xs text-muted">{{ formatDate(s.ultimaFecha) }}</span>
                </div>
              </div>
              <div class="text-lg font-bold" :class="s.saldo < 0 ? 'text-error' : 'text-primary'">
                {{ formatCurrency(s.saldo) }}
              </div>
            </div>

            <USeparator class="my-2" />
            <div class="flex justify-between items-center py-1">
              <span class="text-muted font-medium">Saldo global</span>
              <span class="text-lg font-bold text-primary">{{ formatCurrency(globalBalance) }}</span>
            </div>
          </div>
        </template>
      </UModal>

      <!-- MODAL: selección de factura de proveedor SAP (Trade/Log, pagadas) -->
      <UModal
        v-model:open="facturaModal.show"
        title="Facturas de proveedor pagadas (SAP) — Trade / Log"
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
              @select="(_e, row) => selectFactura(row.original)"
            >
              <template #card_code-cell="{ row }">
                <UBadge size="sm" variant="subtle" :color="row.original.card_code === 'P0148' ? 'primary' : 'info'">
                  {{ row.original.card_code === 'P0148' ? 'Trade' : 'Log' }}
                </UBadge>
              </template>
              <template #fecha-cell="{ row }">
                <span class="text-muted whitespace-nowrap">{{ formatDate(row.original.fecha) }}</span>
              </template>
              <template #concepto-cell="{ row }">
                <span :title="row.original.concepto" class="block max-w-xs truncate">{{ row.original.concepto || '—' }}</span>
              </template>
              <template #subtotal-cell="{ row }">
                <span class="font-bold whitespace-nowrap">{{ formatCurrency(row.original.subtotal) }}</span>
              </template>
              <template #abonado-cell="{ row }">
                <span class="whitespace-nowrap" :class="row.original.abonado > 0 ? 'text-success' : 'text-muted'">
                  {{ formatCurrency(row.original.abonado) }}
                </span>
              </template>
              <template #pendiente-cell="{ row }">
                <strong
                  class="whitespace-nowrap"
                  :class="(row.original.subtotal - row.original.abonado) > 0 ? 'text-warning' : 'text-success'"
                >
                  {{ formatCurrency(row.original.subtotal - row.original.abonado) }}
                </strong>
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
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* El encabezado de la tabla del historial se pega justo debajo de la barra de
   acciones. Su alto real vive en --barra-h (lo mide la vista en vivo); si por
   algo falta, cae a un valor seguro. Se fija aquí con CSS directo para no
   depender de qué clases de Nuxt UI terminen ganando. */
.tabla-historial :deep(thead) {
  position: sticky;
  top: var(--barra-h, 84px);
  z-index: 20;
}
</style>
