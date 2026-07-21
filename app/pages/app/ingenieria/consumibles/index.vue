<script setup>
// Ingeniería > Consumibles.
//
// Seguimiento de solicitudes de consumibles (tóner y similares) por cliente y
// equipo. La pantalla se parte en dos tableros porque responden a preguntas
// distintas: "Pendientes" es la cola de trabajo del día y "Entregados" es el
// histórico que se consulta para aclaraciones. Ambos comparten el mismo bloque
// de tabla, filtros y buscador, para que no se separen con el tiempo.
import axios from '~/utils/axios'

const toast = useToast()

const solicitudes = ref([])
const catalogos = ref({ clientes: [], direcciones: [], consumibles: [], equipos: [], usuarios: [], estados: [] })
const cargando = ref(false)
const errorCarga = ref('')

const cargaInicial = computed(() => cargando.value && !solicitudes.value.length)

const mensajeError = (error, respaldo) =>
  error?.response?.data?.message || error?.message || respaldo

const avisarError = (error, respaldo) =>
  toast.add({ title: mensajeError(error, respaldo), color: 'error', icon: 'i-mdi-alert-circle-outline' })

const avisarExito = titulo =>
  toast.add({ title: titulo, color: 'success', icon: 'i-mdi-check-circle-outline' })

// --- Estados ----------------------------------------------------------------
// Un solo lugar define color, icono y si el estado cierra la solicitud. Los
// tableros, los indicadores y las etiquetas salen todos de aquí.
// `clase` va escrita completa a proposito: Tailwind analiza el codigo fuente
// como texto y no genera las clases que se arman por interpolacion, asi que un
// `text-${color}` se queda sin color.
const ESTADOS = {
  'Solicitado': { color: 'info', clase: 'text-info', icono: 'i-mdi-send-outline', cierra: false },
  'Proceso de Compra': { color: 'warning', clase: 'text-warning', icono: 'i-mdi-cart-outline', cierra: false },
  'En Transito': { color: 'primary', clase: 'text-primary', icono: 'i-mdi-truck-delivery-outline', cierra: false },
  'Entregado': { color: 'success', clase: 'text-success', icono: 'i-mdi-check-circle-outline', cierra: true },
  'Cancelada': { color: 'neutral', clase: 'text-muted', icono: 'i-mdi-close-circle-outline', cierra: true }
}

const METAESTADO_POR_DEFECTO = { color: 'neutral', clase: 'text-muted', icono: 'i-mdi-help-circle-outline', cierra: false }

const metaEstado = estado => ESTADOS[estado] || METAESTADO_POR_DEFECTO

const ORDEN_ESTADOS = Object.keys(ESTADOS)

// --- Formato ----------------------------------------------------------------
// Las fechas llegan en ISO UTC; se arman en hora local para que una solicitud
// de las 9 p.m. no aparezca con la fecha del día siguiente.
const aFechaLocal = (valor) => {
  if (!valor) return null
  const f = new Date(valor)
  return Number.isNaN(f.getTime()) ? null : f
}

const formatearFecha = (valor) => {
  const f = aFechaLocal(valor)
  return f ? f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

const formatearHora = (valor) => {
  const f = aFechaLocal(valor)
  return f ? f.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
}

// Antigüedad de una solicitud pendiente: es el dato que dice cuál urge, más
// que la fecha en sí.
const diasDesde = (valor) => {
  const f = aFechaLocal(valor)
  if (!f) return null
  return Math.floor((Date.now() - f.getTime()) / 86400000)
}

// --- Carga ------------------------------------------------------------------
const cargar = async () => {
  cargando.value = true
  errorCarga.value = ''
  try {
    const [s, c] = await Promise.all([
      axios.get('/consumibles/solicitudes'),
      axios.get('/consumibles/catalogos')
    ])
    solicitudes.value = s.data || []
    catalogos.value = {
      clientes: c.data?.clientes || [],
      direcciones: c.data?.direcciones || [],
      consumibles: c.data?.consumibles || [],
      equipos: c.data?.equipos || [],
      usuarios: c.data?.usuarios || [],
      estados: c.data?.estados || ORDEN_ESTADOS
    }
  } catch (error) {
    errorCarga.value = mensajeError(error, 'No se pudieron cargar las solicitudes.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

// --- Indicadores ------------------------------------------------------------
// Se cuentan sobre el total, no sobre lo filtrado: son el panorama del área,
// no el resultado de la búsqueda de quien está mirando.
const indicadores = computed(() => ORDEN_ESTADOS
  .filter(e => e !== 'Cancelada')
  .map(estado => ({
    estado,
    ...metaEstado(estado),
    total: solicitudes.value.filter(s => s.Estado === estado).length
  }))
)

const totalUrgentes = computed(() =>
  solicitudes.value.filter(s => s.Urgente && !metaEstado(s.Estado).cierra).length
)

// --- Reloj en vivo ----------------------------------------------------------
// El area trabaja contra horarios de entrega, asi que la hora corriente es un
// dato de operacion, no un adorno. Se detiene cuando la pestaña no esta visible
// -un intervalo de un segundo en segundo plano no sirve de nada- y se
// resincroniza al volver, para que nunca muestre una hora vieja.
const ahora = ref(new Date())
let relojTimer = null

const alternarReloj = () => {
  if (relojTimer) { clearInterval(relojTimer); relojTimer = null }
  if (document.visibilityState !== 'visible') return
  ahora.value = new Date()
  relojTimer = setInterval(() => { ahora.value = new Date() }, 1000)
}

onMounted(() => {
  alternarReloj()
  document.addEventListener('visibilitychange', alternarReloj)
})

onUnmounted(() => {
  if (relojTimer) clearInterval(relojTimer)
  document.removeEventListener('visibilitychange', alternarReloj)
})

const dosDigitos = n => String(n).padStart(2, '0')

const reloj = computed(() => ({
  horas: dosDigitos(ahora.value.getHours()),
  minutos: dosDigitos(ahora.value.getMinutes()),
  segundos: dosDigitos(ahora.value.getSeconds())
}))

// "Mar, 21. Jul 2026"
const fechaLarga = computed(() => {
  const f = ahora.value
  const dia = f.toLocaleDateString('es-MX', { weekday: 'short' })
  const mes = f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
  const may = t => t.charAt(0).toUpperCase() + t.slice(1)
  return `${may(dia.replace('.', ''))}, ${f.getDate()}. ${may(mes)} ${f.getFullYear()}`
})

// --- Búsqueda y filtros -----------------------------------------------------
const normalizar = texto => String(texto ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()

// Todo el contenido de la fila entra a la búsqueda, incluida la fecha ya
// formateada: así se puede buscar por folio, cliente, serie o "13/7/2026".
const textoBuscable = s => normalizar([
  s.Folio, s.ClienteNombre, s.ClienteRazonSocial,
  s.ConsumibleNombre, s.ConsumibleModelo, s.ConsumibleDescripcion,
  s.NumeroSerie, s.EquipoUbicacion, s.EquipoModelo,
  s.DireccionNombre, s.DireccionTexto, s.DetallesDireccion, s.InstruccionesEntrega,
  s.SolicitadoPorNombre, s.EntregadoPor, s.Estado, s.Notas,
  formatearFecha(s.FechaSolicitud)
].filter(Boolean).join(' '))

// Estado propio de cada tablero. Se genera con una fábrica para que los dos
// se comporten igual sin duplicar la lógica.
const crearTablero = (clave, titulo, icono, cierra) => ({
  clave,
  titulo,
  icono,
  cierra,
  busqueda: ref(''),
  filtroEstado: ref([]),
  filtroCliente: ref([]),
  soloUrgentes: ref(false)
})

const tableros = [
  crearTablero('pendientes', 'Pendientes', 'i-mdi-timer-sand', false),
  crearTablero('entregados', 'Entregados', 'i-mdi-check-all', true)
]

const estadosDe = tablero => ORDEN_ESTADOS.filter(e => metaEstado(e).cierra === tablero.cierra)

const opcionesCliente = computed(() =>
  [...new Set(solicitudes.value.map(s => s.ClienteNombre).filter(Boolean))].sort()
)

const filtrar = (tablero) => {
  const consulta = normalizar(tablero.busqueda.value).trim()
  const terminos = consulta ? consulta.split(/\s+/) : []

  return solicitudes.value.filter((s) => {
    if (metaEstado(s.Estado).cierra !== tablero.cierra) return false
    if (tablero.filtroEstado.value.length && !tablero.filtroEstado.value.includes(s.Estado)) return false
    if (tablero.filtroCliente.value.length && !tablero.filtroCliente.value.includes(s.ClienteNombre)) return false
    if (tablero.soloUrgentes.value && !s.Urgente) return false
    // Todos los términos deben aparecer, en cualquier campo y en cualquier
    // orden: "regiomontana toner" encuentra la fila aunque estén separados.
    const texto = textoBuscable(s)
    return terminos.every(t => texto.includes(t))
  })
}

const filasPendientes = computed(() => filtrar(tableros[0]))
const filasEntregados = computed(() => filtrar(tableros[1]))
const filasDe = tablero => (tablero.clave === 'pendientes' ? filasPendientes.value : filasEntregados.value)

const hayFiltros = tablero =>
  !!tablero.busqueda.value.trim() || tablero.filtroEstado.value.length > 0
  || tablero.filtroCliente.value.length > 0 || tablero.soloUrgentes.value

const limpiarFiltros = (tablero) => {
  tablero.busqueda.value = ''
  tablero.filtroEstado.value = []
  tablero.filtroCliente.value = []
  tablero.soloUrgentes.value = false
}

// --- Columnas ---------------------------------------------------------------
// `w` es el peso en porcentaje. Con `table-fixed` el ancho se declara en el th
// y el td lo hereda, así la tabla siempre cabe sin scroll horizontal.
const COLUMNAS = [
  { accessorKey: 'Folio', header: 'Folio', meta: { class: { th: 'w-[7%]', td: 'w-[7%]' } } },
  { accessorKey: 'FechaSolicitud', header: 'Solicitud', meta: { class: { th: 'w-[12%]', td: 'w-[12%]' } } },
  { accessorKey: 'ClienteNombre', header: 'Cliente', meta: { class: { th: 'w-[20%]', td: 'w-[20%]' } } },
  { accessorKey: 'ConsumibleNombre', header: 'Consumible', meta: { class: { th: 'w-[27%]', td: 'w-[27%]' } } },
  { accessorKey: 'SolicitadoPorNombre', header: 'Solicitado por', meta: { class: { th: 'w-[16%]', td: 'w-[16%]' } } },
  { accessorKey: 'Estado', header: 'Estado', meta: { class: { th: 'w-[13%]', td: 'w-[13%]' } } },
  { id: 'acciones', header: '', meta: { class: { th: 'w-[5%]', td: 'w-[5%]' } } }
]

// --- Catálogos de SAP -------------------------------------------------------
// Las listas de captura salen de SAP en vivo. Clientes y consumibles se traen
// una vez al abrir el formulario; las direcciones dependen del cliente y las
// series del artículo, así que se piden cuando se elige cada uno.
const sap = ref({ clientes: [], consumibles: [], direcciones: [], series: [] })
const cargandoSap = ref({ base: false, direcciones: false, series: false })
const errorSap = ref('')

const cargarSapBase = async () => {
  if (sap.value.clientes.length && sap.value.consumibles.length) return
  cargandoSap.value.base = true
  errorSap.value = ''
  try {
    const [cl, co] = await Promise.all([
      axios.get('/consumibles/sap/clientes'),
      axios.get('/consumibles/sap/consumibles')
    ])
    sap.value.clientes = cl.data || []
    sap.value.consumibles = co.data || []
  } catch (error) {
    errorSap.value = mensajeError(error, 'No se pudo consultar SAP.')
  } finally {
    cargandoSap.value.base = false
  }
}

const cargarDirecciones = async (cardCode) => {
  sap.value.direcciones = []
  if (!cardCode) return
  cargandoSap.value.direcciones = true
  try {
    const r = await axios.get('/consumibles/sap/direcciones', { params: { cardCode } })
    sap.value.direcciones = r.data || []
  } catch (error) {
    avisarError(error, 'No se pudieron cargar las direcciones')
  } finally {
    cargandoSap.value.direcciones = false
  }
}

// OSRN tiene ~150 mil series, así que nunca se traen todas: se piden filtradas
// por artículo, o por texto cuando se busca a mano.
const cargarSeries = async ({ itemCode, q } = {}) => {
  cargandoSap.value.series = true
  try {
    const r = await axios.get('/consumibles/sap/series', { params: { itemCode, q } })
    sap.value.series = r.data || []
  } catch (error) {
    avisarError(error, 'No se pudieron cargar los números de serie')
  } finally {
    cargandoSap.value.series = false
  }
}

// Buscar en todas las series, no sólo en las del artículo elegido. Hace falta
// porque en SAP las series de impresora cuelgan del código de la impresora, no
// del tóner que se le surte.
const buscarTodasLasSeries = ref(false)
const busquedaSerie = ref('')
let temporizadorSerie = null

watch([busquedaSerie, buscarTodasLasSeries], () => {
  clearTimeout(temporizadorSerie)
  temporizadorSerie = setTimeout(() => {
    const q = busquedaSerie.value.trim()
    if (buscarTodasLasSeries.value) {
      if (q.length >= 3) cargarSeries({ q })
      else sap.value.series = []
    } else if (formulario.value.ItemCode) {
      cargarSeries({ itemCode: formulario.value.ItemCode, q: q || undefined })
    }
  }, 300)
})

// --- Formulario -------------------------------------------------------------
const modalFormulario = ref(false)
const guardando = ref(false)
const solicitudEditada = ref(null)

const formularioVacio = () => ({
  // Claves de SAP: el backend las materializa en el catálogo local al guardar.
  CardCode: null,
  CardName: '',
  DireccionTexto: '',
  DireccionNombre: '',
  ItemCode: null,
  ItemName: '',
  Serie: null,
  SerieArticulo: '',
  ClienteID: null,
  DireccionID: null,
  DetallesDireccion: '',
  InstruccionesEntrega: '',
  ConsumibleID: null,
  EquipoID: null,
  Estado: 'Solicitado',
  Urgente: false,
  SolicitadoPor: null,
  EntregadoPor: '',
  Notas: ''
})

const formulario = ref(formularioVacio())
const errores = ref({ ClienteID: '', ConsumibleID: '' })

const abrirAlta = () => {
  solicitudEditada.value = null
  formulario.value = formularioVacio()
  errores.value = { ClienteID: '', ConsumibleID: '' }
  sap.value.direcciones = []
  sap.value.series = []
  busquedaSerie.value = ''
  buscarTodasLasSeries.value = false
  modalFormulario.value = true
  cargarSapBase()
}

const abrirEdicion = (s) => {
  solicitudEditada.value = s
  formulario.value = {
    ...formularioVacio(),
    ClienteID: s.ClienteID ?? null,
    DireccionID: s.DireccionID ?? null,
    DetallesDireccion: s.DetallesDireccion || '',
    InstruccionesEntrega: s.InstruccionesEntrega || '',
    ConsumibleID: s.ConsumibleID ?? null,
    EquipoID: s.EquipoID ?? null,
    Estado: s.Estado || 'Solicitado',
    Urgente: !!s.Urgente,
    SolicitadoPor: s.SolicitadoPor ?? null,
    EntregadoPor: s.EntregadoPor || '',
    Notas: s.Notas || ''
  }
  errores.value = { ClienteID: '', ConsumibleID: '' }
  modalFormulario.value = true
}

// Opciones de SAP para los selectores del formulario.
const opcionesClienteSap = computed(() =>
  sap.value.clientes.map(c => ({ label: c.Cliente, codigo: c.CardCode, value: c.CardCode }))
)

// La dirección se identifica por su texto y no por un id: CRD1 no expone una
// llave estable y el texto es justamente lo que se guarda en la solicitud.
const opcionesDireccionSap = computed(() =>
  sap.value.direcciones.map(d => ({ label: d.Nombre || d.Direccion, tipo: d.Tipo, value: d.Direccion }))
)

const opcionesConsumibleSap = computed(() =>
  sap.value.consumibles.map(c => ({
    label: c.Consumible,
    descripcion: c.Descripcion,
    stock: Number(c.Stock) || 0,
    value: c.ItemCode
  }))
)

const opcionesSerieSap = computed(() =>
  sap.value.series.map(s => ({ label: s.Serie, articulo: s.Articulo, item: s.ItemCode, value: s.Serie }))
)

const stockDelElegido = computed(() => {
  if (!formulario.value.ItemCode) return null
  const c = opcionesConsumibleSap.value.find(x => x.value === formulario.value.ItemCode)
  return c ? c.stock : null
})

// Al elegir cliente se traen sus direcciones y se limpia lo que dependía del
// cliente anterior.
watch(() => formulario.value.CardCode, async (nuevo, anterior) => {
  const c = opcionesClienteSap.value.find(x => x.value === nuevo)
  formulario.value.CardName = c ? c.label : ''
  if (anterior !== undefined && nuevo !== anterior) {
    formulario.value.DireccionTexto = ''
    formulario.value.DireccionNombre = ''
  }
  await cargarDirecciones(nuevo)
})

watch(() => formulario.value.DireccionTexto, (nuevo) => {
  const d = opcionesDireccionSap.value.find(x => x.value === nuevo)
  formulario.value.DireccionNombre = d ? d.label : ''
})

// Al elegir consumible se traen las series de ese artículo.
watch(() => formulario.value.ItemCode, (nuevo, anterior) => {
  const c = opcionesConsumibleSap.value.find(x => x.value === nuevo)
  formulario.value.ItemName = c ? c.descripcion : ''
  if (anterior !== undefined && nuevo !== anterior) formulario.value.Serie = null
  busquedaSerie.value = ''
  if (nuevo && !buscarTodasLasSeries.value) cargarSeries({ itemCode: nuevo })
})

watch(() => formulario.value.Serie, (nuevo) => {
  const s = opcionesSerieSap.value.find(x => x.value === nuevo)
  formulario.value.SerieArticulo = s ? s.articulo : ''
})

const guardar = async () => {
  errores.value = {
    ClienteID: (formulario.value.CardCode || formulario.value.ClienteID) ? '' : 'Selecciona un cliente',
    ConsumibleID: (formulario.value.ItemCode || formulario.value.ConsumibleID) ? '' : 'Selecciona un consumible'
  }
  if (errores.value.ClienteID || errores.value.ConsumibleID) return

  guardando.value = true
  try {
    if (solicitudEditada.value) {
      await axios.put(`/consumibles/solicitudes/${solicitudEditada.value.SolicitudID}`, formulario.value)
      avisarExito('Solicitud actualizada')
    } else {
      const r = await axios.post('/consumibles/solicitudes', formulario.value)
      avisarExito(`Solicitud ${r.data?.Folio ?? ''} creada`)
    }
    modalFormulario.value = false
    await cargar()
  } catch (error) {
    avisarError(error, 'No se pudo guardar la solicitud')
  } finally {
    guardando.value = false
  }
}

// --- Detalle ----------------------------------------------------------------
const modalDetalle = ref(false)
const detalle = ref(null)
const cargandoDetalle = ref(false)

const abrirDetalle = async (s) => {
  modalDetalle.value = true
  cargandoDetalle.value = true
  detalle.value = null
  try {
    const r = await axios.get(`/consumibles/solicitudes/${s.SolicitudID}`)
    detalle.value = r.data
  } catch (error) {
    avisarError(error, 'No se pudo cargar la solicitud')
    modalDetalle.value = false
  } finally {
    cargandoDetalle.value = false
  }
}

// Avanzar al siguiente estado es la acción más repetida del módulo, así que va
// a un clic desde el detalle en vez de obligar a abrir el formulario.
const siguienteEstado = computed(() => {
  if (!detalle.value) return null
  const flujo = ORDEN_ESTADOS.filter(e => e !== 'Cancelada')
  const i = flujo.indexOf(detalle.value.Estado)
  return i >= 0 && i < flujo.length - 1 ? flujo[i + 1] : null
})

const cambiandoEstado = ref(false)

const cambiarEstado = async (estado) => {
  if (!detalle.value) return
  cambiandoEstado.value = true
  try {
    await axios.put(`/consumibles/solicitudes/${detalle.value.SolicitudID}`, { Estado: estado })
    avisarExito(`Solicitud marcada como ${estado}`)
    const id = detalle.value.SolicitudID
    await cargar()
    const r = await axios.get(`/consumibles/solicitudes/${id}`)
    detalle.value = r.data
  } catch (error) {
    avisarError(error, 'No se pudo cambiar el estado')
  } finally {
    cambiandoEstado.value = false
  }
}

// --- Notificar --------------------------------------------------------------
const modalNotificar = ref(false)
const notificando = ref(false)
const notificarA = ref([])
const mensajeNotificacion = ref('')

const abrirNotificar = () => {
  notificarA.value = []
  mensajeNotificacion.value = ''
  modalNotificar.value = true
}

const enviarNotificacion = async () => {
  if (!detalle.value || !notificarA.value.length) return
  notificando.value = true
  try {
    const r = await axios.post(`/consumibles/solicitudes/${detalle.value.SolicitudID}/notificar`, {
      UserIDs: notificarA.value,
      Mensaje: mensajeNotificacion.value.trim() || undefined
    })
    const { enviados = [], fallidos = [] } = r.data || {}
    avisarExito(enviados.length === 1
      ? `Ticket enviado a ${enviados[0].FullName}`
      : `Ticket enviado a ${enviados.length} personas`)

    // Un envio parcial no se reporta como exito a secas: quien no lo recibio
    // se queda esperando un aviso que nunca llego.
    if (fallidos.length) {
      toast.add({
        title: `No se pudo enviar a ${fallidos.length}`,
        description: fallidos.map(f => `${f.FullName}: ${f.motivo}`).join(' · '),
        color: 'warning',
        icon: 'i-mdi-email-alert-outline'
      })
    }
    modalNotificar.value = false
    // La bitacora registra el aviso, asi que se recarga el detalle.
    const d = await axios.get(`/consumibles/solicitudes/${detalle.value.SolicitudID}`)
    detalle.value = d.data
  } catch (error) {
    avisarError(error, 'No se pudo enviar la notificacion')
  } finally {
    notificando.value = false
  }
}

const eliminar = async (s) => {
  if (!confirm(`¿Eliminar la solicitud ${s.Folio}? Esta acción no se puede deshacer.`)) return
  try {
    await axios.delete(`/consumibles/solicitudes/${s.SolicitudID}`)
    avisarExito('Solicitud eliminada')
    modalDetalle.value = false
    await cargar()
  } catch (error) {
    avisarError(error, 'No se pudo eliminar la solicitud')
  }
}

</script>

<template>
  <UDashboardPanel id="consumibles">
    <template #header>
      <UDashboardNavbar title="Consumibles" icon="i-mdi-package-variant-closed">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-mdi-refresh"
            color="neutral"
            variant="ghost"
            :loading="cargando"
            aria-label="Actualizar"
            @click="cargar"
          />
          <UButton
            label="Nueva Solicitud"
            icon="i-mdi-plus"
            @click="abrirAlta"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="errorCarga"
        color="error"
        variant="subtle"
        icon="i-mdi-alert-circle-outline"
        :title="errorCarga"
        class="mb-4"
      >
        <template #actions>
          <UButton label="Reintentar" color="error" variant="outline" size="xs" @click="cargar" />
        </template>
      </UAlert>

      <!-- Indicadores por estado: el panorama del área, no el resultado de la
           búsqueda de quien esté mirando. -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <template v-if="cargaInicial">
          <UCard v-for="n in 4" :key="n" :ui="{ body: 'p-4' }">
            <USkeleton class="h-3 w-24 mb-3" />
            <USkeleton class="h-8 w-12" />
          </UCard>
        </template>
        <UCard
          v-for="ind in indicadores"
          v-else
          :key="ind.estado"
          :ui="{ body: 'p-4' }"
        >
          <div class="flex items-center gap-2 mb-1">
            <UIcon :name="ind.icono" class="size-4" :class="ind.clase" />
            <span class="text-xs uppercase tracking-wide text-muted truncate">{{ ind.estado }}</span>
          </div>
          <div class="text-3xl font-bold text-highlighted">
            {{ ind.total }}
          </div>
        </UCard>
      </div>

      <!-- Reloj. Va sobre una tarjeta como el resto de la pantalla, en lugar de
           flotar suelto, y toma el color de la empresa igual que la barra de
           titulo. Los digitos usan `tabular-nums` para que no bailen de ancho
           al cambiar de cifra. -->
      <UCard class="mb-4" :ui="{ body: 'py-4' }">
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
          <div class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-mdi-calendar-blank-outline" class="size-4 shrink-0" />
            {{ fechaLarga }}
          </div>

          <div class="reloj">
            <div class="reloj-bloque reloj-principal">{{ reloj.horas }}</div>
            <span class="reloj-dos-puntos">:</span>
            <div class="reloj-bloque reloj-principal">{{ reloj.minutos }}</div>
            <span class="reloj-dos-puntos">:</span>
            <div class="reloj-bloque reloj-segundos">{{ reloj.segundos }}</div>
          </div>
        </div>
      </UCard>

      <UAlert
        v-if="totalUrgentes > 0"
        color="error"
        variant="subtle"
        icon="i-mdi-alarm-light-outline"
        class="mb-4"
        :title="totalUrgentes === 1
          ? 'Hay 1 solicitud urgente sin entregar'
          : `Hay ${totalUrgentes} solicitudes urgentes sin entregar`"
        description="El cliente las pidió con la máxima prioridad."
      />

      <!-- Los dos tableros comparten el mismo bloque para que no se separen
           con el tiempo: mismos filtros, mismas columnas, mismo comportamiento. -->
      <UCard
        v-for="tablero in tableros"
        :key="tablero.clave"
        class="mb-4"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <UIcon :name="tablero.icono" class="size-5 text-primary shrink-0" />
            <h2 class="text-base font-semibold text-highlighted">
              {{ tablero.titulo }}
            </h2>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ filasDe(tablero).length }}
            </UBadge>

            <div class="flex-1" />

            <UInput
              v-model="tablero.busqueda.value"
              icon="i-mdi-magnify"
              placeholder="Buscar..."
              class="w-full sm:w-56"
              :ui="{ trailing: 'pe-1' }"
            >
              <template v-if="tablero.busqueda.value" #trailing>
                <UButton
                  icon="i-mdi-close"
                  color="neutral"
                  variant="link"
                  size="xs"
                  aria-label="Limpiar"
                  @click="tablero.busqueda.value = ''"
                />
              </template>
            </UInput>

            <USelectMenu
              v-model="tablero.filtroEstado.value"
              :items="estadosDe(tablero)"
              multiple
              placeholder="Estado"
              icon="i-mdi-filter-variant"
              class="w-40"
            />

            <USelectMenu
              v-model="tablero.filtroCliente.value"
              :items="opcionesCliente"
              multiple
              placeholder="Cliente"
              icon="i-mdi-domain"
              :search-input="{ placeholder: 'Buscar cliente...' }"
              class="w-44"
            />

            <UButton
              label="Urgentes"
              icon="i-mdi-alarm-light-outline"
              size="sm"
              :color="tablero.soloUrgentes.value ? 'error' : 'neutral'"
              :variant="tablero.soloUrgentes.value ? 'solid' : 'outline'"
              @click="tablero.soloUrgentes.value = !tablero.soloUrgentes.value"
            />

            <UButton
              v-if="hayFiltros(tablero)"
              label="Limpiar"
              icon="i-mdi-filter-remove-outline"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="limpiarFiltros(tablero)"
            />
          </div>
        </template>

        <!-- El scroll vive en el contenedor de la tabla, no en la página: los
             encabezados y los filtros quedan fijos mientras se recorre. -->
        <div class="overflow-auto" style="max-height: 32rem">
          <UTable
            :data="filasDe(tablero)"
            :columns="COLUMNAS"
            :loading="cargaInicial"
            :ui="{ base: 'table-fixed w-full', td: 'py-2', th: 'py-2' }"
            class="w-full"
            @select="(_e, row) => abrirDetalle(row.original)"
          >
            <template #loading>
              <div class="p-3 space-y-3">
                <div v-for="n in 5" :key="n" class="flex items-center gap-3">
                  <USkeleton class="h-4 w-12 shrink-0" />
                  <USkeleton class="h-4 w-20 shrink-0" />
                  <USkeleton class="h-4 w-40 shrink-0" />
                  <USkeleton class="h-4 flex-1" />
                  <USkeleton class="h-4 w-24 shrink-0" />
                  <USkeleton class="h-4 w-20 shrink-0" />
                </div>
              </div>
            </template>

            <template #empty>
              <div class="py-10 text-center">
                <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                  <UIcon
                    :name="hayFiltros(tablero) ? 'i-mdi-filter-remove-outline' : tablero.icono"
                    class="size-7 text-primary"
                  />
                </div>
                <p class="font-medium text-highlighted">
                  {{ hayFiltros(tablero)
                    ? 'Ninguna solicitud coincide con los filtros'
                    : tablero.cierra ? 'Todavía no hay entregas registradas' : 'No hay solicitudes pendientes' }}
                </p>
                <p class="text-sm text-muted mt-1">
                  {{ hayFiltros(tablero)
                    ? 'Prueba quitando alguno para ampliar la búsqueda.'
                    : tablero.cierra ? 'Aquí aparecerán las solicitudes conforme se entreguen.' : 'Todo lo solicitado ya se entregó.' }}
                </p>
                <UButton
                  v-if="hayFiltros(tablero)"
                  label="Limpiar filtros"
                  icon="i-mdi-filter-remove-outline"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="mt-4"
                  @click="limpiarFiltros(tablero)"
                />
                <UButton
                  v-else-if="!tablero.cierra"
                  label="Nueva Solicitud"
                  icon="i-mdi-plus"
                  size="sm"
                  class="mt-4"
                  @click="abrirAlta"
                />
              </div>
            </template>

            <template #Folio-cell="{ row }">
              <div class="flex items-center gap-1.5">
                <UIcon
                  v-if="row.original.Urgente && !metaEstado(row.original.Estado).cierra"
                  name="i-mdi-alarm-light"
                  class="size-4 text-error shrink-0"
                  title="Urgente"
                />
                <span class="font-mono font-semibold text-highlighted">{{ row.original.Folio }}</span>
              </div>
            </template>

            <template #FechaSolicitud-cell="{ row }">
              <div class="min-w-0">
                <div class="text-sm text-highlighted truncate">
                  {{ formatearFecha(row.original.FechaSolicitud) }}
                </div>
                <div class="text-xs text-muted truncate">
                  <template v-if="!metaEstado(row.original.Estado).cierra && diasDesde(row.original.FechaSolicitud) > 0">
                    hace {{ diasDesde(row.original.FechaSolicitud) }} d
                  </template>
                  <template v-else>
                    {{ formatearHora(row.original.FechaSolicitud) }}
                  </template>
                </div>
              </div>
            </template>

            <template #ClienteNombre-cell="{ row }">
              <div class="min-w-0">
                <div class="truncate text-highlighted">
                  {{ row.original.ClienteNombre || 'Sin cliente' }}
                </div>
                <div v-if="row.original.DireccionNombre" class="text-xs text-muted truncate">
                  {{ row.original.DireccionNombre }}
                </div>
              </div>
            </template>

            <template #ConsumibleNombre-cell="{ row }">
              <div class="min-w-0">
                <div class="truncate text-highlighted">
                  {{ row.original.ConsumibleNombre || 'Sin consumible' }}
                </div>
                <div class="text-xs text-muted truncate">
                  {{ [row.original.ConsumibleModelo, row.original.EquipoUbicacion, row.original.NumeroSerie].filter(Boolean).join(' · ') || '—' }}
                </div>
              </div>
            </template>

            <template #SolicitadoPorNombre-cell="{ row }">
              <span class="truncate text-sm">{{ row.original.SolicitadoPorNombre || '—' }}</span>
            </template>

            <template #Estado-cell="{ row }">
              <UBadge
                :color="metaEstado(row.original.Estado).color"
                :icon="metaEstado(row.original.Estado).icono"
                variant="subtle"
                size="sm"
                class="max-w-full"
              >
                <span class="truncate">{{ row.original.Estado }}</span>
              </UBadge>
            </template>

            <template #acciones-cell="{ row }">
              <UButton
                icon="i-mdi-pencil-outline"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Editar"
                @click.stop="abrirEdicion(row.original)"
              />
            </template>
          </UTable>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>

  <!-- Formulario de captura -->
  <UModal
    v-model:open="modalFormulario"
    :title="solicitudEditada ? `Editar solicitud ${solicitudEditada.Folio}` : 'Nueva Solicitud'"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="errorSap"
          color="error"
          variant="subtle"
          icon="i-mdi-database-alert-outline"
          :title="errorSap"
          class="mb-1"
        >
          <template #actions>
            <UButton label="Reintentar" color="error" variant="outline" size="xs" @click="cargarSapBase" />
          </template>
        </UAlert>

        <UFormField label="Cliente" required :error="errores.ClienteID">
          <USelectMenu
            v-model="formulario.CardCode"
            :items="opcionesClienteSap"
            value-key="value"
            :loading="cargandoSap.base"
            placeholder="Selecciona un cliente"
            :search-input="{ placeholder: 'Buscar por nombre o codigo...' }"
            icon="i-mdi-domain"
            class="w-full"
          >
            <template #item-label="{ item }">
              <div class="min-w-0">
                <div class="truncate">{{ item.label }}</div>
                <div class="text-xs text-muted font-mono">{{ item.codigo }}</div>
              </div>
            </template>
          </USelectMenu>
        </UFormField>

        <UFormField
          label="Direccion de entrega"
          :help="formulario.CardCode ? 'Las de envio aparecen primero; las fiscales van marcadas.' : 'Elige primero el cliente.'"
        >
          <USelectMenu
            v-model="formulario.DireccionTexto"
            :items="opcionesDireccionSap"
            value-key="value"
            :loading="cargandoSap.direcciones"
            :disabled="!formulario.CardCode"
            placeholder="Sin especificar"
            :search-input="{ placeholder: 'Buscar direccion...' }"
            icon="i-mdi-map-marker-outline"
            class="w-full"
          >
            <template #item-label="{ item }">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="truncate">{{ item.label }}</span>
                  <UBadge v-if="item.tipo === 'B'" color="neutral" variant="subtle" size="xs">Fiscal</UBadge>
                </div>
                <div class="text-xs text-muted truncate">{{ item.value }}</div>
              </div>
            </template>
          </USelectMenu>
        </UFormField>

        <UFormField label="Detalles de la direccion">
          <UInput
            v-model="formulario.DetallesDireccion"
            placeholder="Piso, oficina, referencias..."
            class="w-full"
          />
        </UFormField>

        <UFormField label="Instrucciones de entrega">
          <UTextarea
            v-model="formulario.InstruccionesEntrega"
            :rows="2"
            placeholder="Horario, con quien dejarlo, accesos..."
            class="w-full"
          />
        </UFormField>

        <UFormField label="Consumible" required :error="errores.ConsumibleID">
          <USelectMenu
            v-model="formulario.ItemCode"
            :items="opcionesConsumibleSap"
            value-key="value"
            :loading="cargandoSap.base"
            placeholder="Selecciona un consumible"
            :search-input="{ placeholder: 'Buscar por clave o descripcion...' }"
            icon="i-mdi-printer-outline"
            class="w-full"
          >
            <template #item-label="{ item }">
              <div class="flex items-start gap-2 min-w-0 w-full">
                <div class="min-w-0 flex-1">
                  <div class="truncate">{{ item.descripcion }}</div>
                  <div class="text-xs text-muted font-mono">{{ item.value }}</div>
                </div>
                <!-- La existencia se muestra al elegir, no despues: es lo que
                     decide si el pedido se surte hoy o entra a compra. -->
                <UBadge
                  :color="item.stock > 0 ? 'success' : 'neutral'"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                >
                  {{ item.stock > 0 ? item.stock + ' en stock' : 'Sin stock' }}
                </UBadge>
              </div>
            </template>
          </USelectMenu>
          <template v-if="stockDelElegido !== null" #help>
            <span :class="stockDelElegido > 0 ? 'text-success' : 'text-warning'">
              {{ stockDelElegido > 0
                ? `Hay ${stockDelElegido} en existencia segun SAP.`
                : 'Sin existencia en SAP: probablemente pase a proceso de compra.' }}
            </span>
          </template>
        </UFormField>

        <UFormField label="Numero de serie">
          <div class="space-y-2">
            <USelectMenu
              v-model="formulario.Serie"
              :items="opcionesSerieSap"
              value-key="value"
              :loading="cargandoSap.series"
              :disabled="!formulario.ItemCode && !buscarTodasLasSeries"
              placeholder="Sin especificar"
              :search-input="{ placeholder: 'Buscar serie...' }"
              icon="i-mdi-barcode"
              class="w-full"
              @update:search-term="busquedaSerie = $event"
            >
              <template #item-label="{ item }">
                <div class="min-w-0">
                  <div class="truncate font-mono">{{ item.label }}</div>
                  <div v-if="item.articulo" class="text-xs text-muted truncate">{{ item.articulo }}</div>
                </div>
              </template>
              <template #empty>
                <p class="text-sm text-muted p-2">
                  {{ buscarTodasLasSeries
                    ? 'Escribe al menos 3 caracteres para buscar.'
                    : 'Este articulo no tiene series utiles. Activa la busqueda en todas.' }}
                </p>
              </template>
            </USelectMenu>

            <!-- En SAP las series de impresora cuelgan del codigo de la
                 impresora, no del toner. Sin esta opcion no habria forma de
                 capturar la serie real del equipo. -->
            <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium text-highlighted">Buscar en todas las series</div>
                <p class="text-xs text-muted">
                  Las series de impresora no cuelgan del toner, sino del equipo.
                </p>
              </div>
              <USwitch v-model="buscarTodasLasSeries" />
            </div>
          </div>
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Estado">
            <USelectMenu
              v-model="formulario.Estado"
              :items="catalogos.estados"
              icon="i-mdi-progress-check"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Solicitado por">
            <USelectMenu
              v-model="formulario.SolicitadoPor"
              :items="opcionesUsuario"
              value-key="value"
              placeholder="Yo"
              :search-input="{ placeholder: 'Buscar persona...' }"
              icon="i-mdi-account-outline"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Entregado por" help="Quién realizó la entrega. Puede no tener cuenta en el portal.">
          <UInput v-model="formulario.EntregadoPor" class="w-full" />
        </UFormField>

        <UFormField label="Notas">
          <UTextarea v-model="formulario.Notas" :rows="2" class="w-full" />
        </UFormField>

        <div class="flex items-center justify-between gap-4 rounded-lg border border-default p-3">
          <div class="min-w-0">
            <div class="font-medium text-highlighted">Urgente</div>
            <p class="text-sm text-muted">
              Marcar sólo si el cliente la pidió con la máxima prioridad.
            </p>
          </div>
          <USwitch v-model="formulario.Urgente" color="error" />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="modalFormulario = false" />
        <UButton
          :label="solicitudEditada ? 'Guardar' : 'Enviar'"
          icon="i-mdi-check"
          :loading="guardando"
          @click="guardar"
        />
      </div>
    </template>
  </UModal>

  <!-- Notificar -->
  <UModal v-model:open="modalNotificar" title="Notificar solicitud">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Se envia un ticket por correo con todos los datos de la solicitud, y
          queda un aviso en la bandeja del portal.
        </p>

        <UFormField label="Usuarios" required help="Puedes seleccionar varios.">
          <USelectMenu
            v-model="notificarA"
            :items="opcionesUsuario"
            value-key="value"
            multiple
            placeholder="Selecciona a quien avisar"
            :search-input="{ placeholder: 'Buscar persona...' }"
            icon="i-mdi-account-multiple-outline"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Mensaje" help="Opcional. Aparece destacado dentro del ticket.">
          <UTextarea
            v-model="mensajeNotificacion"
            :rows="3"
            placeholder="Contexto o instrucciones para quien lo recibe..."
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="modalNotificar = false" />
        <UButton
          label="Enviar ticket"
          icon="i-mdi-send"
          :loading="notificando"
          :disabled="!notificarA.length"
          @click="enviarNotificacion"
        />
      </div>
    </template>
  </UModal>

  <!-- Detalle -->
  <UModal
    v-model:open="modalDetalle"
    :title="detalle ? `Solicitud ${detalle.Folio}` : 'Solicitud'"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div v-if="cargandoDetalle" class="space-y-3">
        <USkeleton class="h-5 w-40" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-3/4" />
        <USkeleton class="h-24 w-full" />
      </div>

      <div v-else-if="detalle" class="space-y-5">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="metaEstado(detalle.Estado).color"
            :icon="metaEstado(detalle.Estado).icono"
            variant="subtle"
            size="lg"
          >
            {{ detalle.Estado }}
          </UBadge>
          <UBadge v-if="detalle.Urgente" color="error" variant="solid" size="lg" icon="i-mdi-alarm-light">
            Urgente
          </UBadge>
        </div>

        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt class="text-muted text-xs uppercase tracking-wide">Cliente</dt>
            <dd class="text-highlighted">{{ detalle.ClienteNombre || '—' }}</dd>
          </div>
          <div>
            <dt class="text-muted text-xs uppercase tracking-wide">Solicitado por</dt>
            <dd class="text-highlighted">{{ detalle.SolicitadoPorNombre || '—' }}</dd>
          </div>
          <div v-if="detalle.EntregadoPor || detalle.FechaEntrega">
            <dt class="text-muted text-xs uppercase tracking-wide">Entregado</dt>
            <dd class="text-highlighted">
              {{ detalle.EntregadoPor || 'Sin registrar quién' }}
              <span v-if="detalle.FechaEntrega" class="text-muted">
                · {{ formatearFecha(detalle.FechaEntrega) }}
              </span>
            </dd>
          </div>
          <div>
            <dt class="text-muted text-xs uppercase tracking-wide">Consumible</dt>
            <dd class="text-highlighted">
              {{ detalle.ConsumibleNombre || '—' }}
              <span v-if="detalle.ConsumibleModelo" class="text-muted">· {{ detalle.ConsumibleModelo }}</span>
            </dd>
          </div>
          <div>
            <dt class="text-muted text-xs uppercase tracking-wide">Número de serie</dt>
            <dd class="text-highlighted font-mono">{{ detalle.NumeroSerie || '—' }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-muted text-xs uppercase tracking-wide">Entrega</dt>
            <dd class="text-highlighted">
              {{ [detalle.DireccionNombre, detalle.DireccionTexto, detalle.DetallesDireccion].filter(Boolean).join(' · ') || '—' }}
            </dd>
          </div>
          <div v-if="detalle.InstruccionesEntrega" class="sm:col-span-2">
            <dt class="text-muted text-xs uppercase tracking-wide">Instrucciones</dt>
            <dd class="text-highlighted">{{ detalle.InstruccionesEntrega }}</dd>
          </div>
          <div v-if="detalle.Notas" class="sm:col-span-2">
            <dt class="text-muted text-xs uppercase tracking-wide">Notas</dt>
            <dd class="text-highlighted">{{ detalle.Notas }}</dd>
          </div>
        </dl>

        <!-- Bitácora: es lo que permite responder "¿cuándo pasó a tránsito?",
             que el estado actual por sí solo no contesta. -->
        <div>
          <h3 class="text-xs uppercase tracking-wide text-muted mb-2">Seguimiento</h3>
          <ol class="space-y-3">
            <li
              v-for="evento in detalle.eventos"
              :key="evento.EventoID"
              class="flex gap-3"
            >
              <div class="flex flex-col items-center shrink-0">
                <div class="flex items-center justify-center size-7 rounded-full bg-elevated">
                  <UIcon :name="metaEstado(evento.Estado).icono" class="size-4" :class="metaEstado(evento.Estado).clase" />
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-highlighted">{{ evento.Estado }}</div>
                <div class="text-xs text-muted">
                  {{ formatearFecha(evento.Fecha) }} {{ formatearHora(evento.Fecha) }}
                  <template v-if="evento.Usuario"> · {{ evento.Usuario }}</template>
                </div>
                <div v-if="evento.Nota" class="text-sm text-muted mt-0.5">{{ evento.Nota }}</div>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-wrap justify-between gap-2 w-full">
        <UButton
          label="Eliminar"
          icon="i-mdi-trash-can-outline"
          color="error"
          variant="ghost"
          @click="detalle && eliminar(detalle)"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="detalle && !metaEstado(detalle.Estado).cierra"
            label="Cancelar solicitud"
            color="neutral"
            variant="ghost"
            :loading="cambiandoEstado"
            @click="cambiarEstado('Cancelada')"
          />
          <UButton
            label="Notificar"
            icon="i-mdi-email-fast-outline"
            color="neutral"
            variant="subtle"
            @click="abrirNotificar"
          />
          <UButton
            label="Editar"
            icon="i-mdi-pencil-outline"
            color="neutral"
            variant="subtle"
            @click="modalDetalle = false; detalle && abrirEdicion(detalle)"
          />
          <!-- Avanzar de estado es la acción más repetida: va a un clic, sin
               pasar por el formulario completo. -->
          <UButton
            v-if="siguienteEstado"
            :label="`Marcar ${siguienteEstado}`"
            :icon="metaEstado(siguienteEstado).icono"
            :loading="cambiandoEstado"
            @click="cambiarEstado(siguienteEstado)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
