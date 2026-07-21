<script setup>
// Módulo de Operaciones: listado de la flotilla de vehículos.
//
// La pantalla ofrece dos lecturas del mismo conjunto de datos:
//   - Cuadrícula: pensada para reconocer el vehículo por su foto.
//   - Lista: pensada para comparar datos duros (placas, gasto, vigencias).
// El modo elegido se recuerda en localStorage porque es una preferencia
// personal de trabajo, no un filtro: molesta tener que volver a elegirlo.
import { h, resolveComponent } from 'vue'
import axios from '~/utils/axios'

const UButton = resolveComponent('UButton')

const router = useRouter()
const toast = useToast()

const vehiculos = ref([])
const catalogos = ref({ usuarios: [], tiposOperacion: [], estatusVehiculo: [] })
const cargando = ref(false)
const guardando = ref(false)
const errorCarga = ref('')

// Primera carga (esqueletos) contra recargas posteriores: al recargar se
// mantienen los datos visibles para que la pantalla no parpadee.
const cargaInicial = computed(() => cargando.value && !vehiculos.value.length)

const mensajeError = (error, respaldo) =>
  error?.response?.data?.message || error?.message || respaldo

// --- Modo de vista ----------------------------------------------------------
const CLAVE_VISTA = 'flotilla:modoVista'
const modoVista = ref('cuadricula')

watch(modoVista, (v) => {
  if (import.meta.client) localStorage.setItem(CLAVE_VISTA, v)
})

// --- Formato ----------------------------------------------------------------
const formatoMoneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
})

const formatearMoneda = valor => formatoMoneda.format(Number(valor) || 0)

// Las fechas llegan como ISO en UTC. Si se dejaran a `new Date()` a secas, en
// México (UTC-6) una fecha de calendario se corre un día hacia atrás. Por eso
// se toma sólo la parte YYYY-MM-DD y se arma la fecha en hora local.
const aFechaLocal = (valor) => {
  if (!valor) return null
  const texto = String(valor).slice(0, 10)
  const [anio, mes, dia] = texto.split('-').map(Number)
  if (!anio || !mes || !dia) return null
  return new Date(anio, mes - 1, dia)
}

const formatearFechaLarga = (valor) => {
  const fecha = aFechaLocal(valor)
  if (!fecha) return 'Sin registrar'
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

const formatearFechaCorta = (valor) => {
  const fecha = aFechaLocal(valor)
  if (!fecha) return '—'
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Valor para un <input type="date">, que siempre espera YYYY-MM-DD.
const aValorInputFecha = valor => (valor ? String(valor).slice(0, 10) : '')

// --- Semáforo de vencimientos -----------------------------------------------
// Un único criterio para las tres vigencias (seguro, verificación y tenencia):
// vencido -> error, dentro de 30 días -> warning, más lejos -> success discreto.
const DIAS_AVISO = 30
const MS_POR_DIA = 86400000

const hoyLocal = () => {
  const ahora = new Date()
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
}

const diasPara = (valor) => {
  const fecha = aFechaLocal(valor)
  if (!fecha) return null
  return Math.round((fecha.getTime() - hoyLocal().getTime()) / MS_POR_DIA)
}

// Devuelve null cuando no hay fecha capturada: no se inventa un estado para un
// dato que simplemente no existe todavía.
const estadoVigencia = (valor) => {
  const dias = diasPara(valor)
  if (dias === null) return null
  if (dias < 0) {
    return {
      nivel: 'vencido',
      color: 'error',
      icono: 'i-mdi-alert-octagon-outline',
      texto: dias === -1 ? 'Venció ayer' : `Venció hace ${Math.abs(dias)} días`
    }
  }
  if (dias <= DIAS_AVISO) {
    return {
      nivel: 'proximo',
      color: 'warning',
      icono: 'i-mdi-alert-outline',
      texto: dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`
    }
  }
  return { nivel: 'vigente', color: 'success', icono: 'i-mdi-check-circle-outline', texto: 'Vigente' }
}

const VIGENCIAS = [
  { campo: 'VigenciaSeguro', etiqueta: 'Seguro' },
  { campo: 'VigenciaVerificacion', etiqueta: 'Verificación' },
  { campo: 'VigenciaTenencia', etiqueta: 'Tenencia' }
]

// Alertas de un vehículo: sólo las vigencias vencidas o por vencer, ordenadas
// de la más urgente a la menos. Las vigentes no generan ruido.
const alertasDe = (vehiculo) => {
  return VIGENCIAS
    .map((v) => {
      const estado = estadoVigencia(vehiculo[v.campo])
      if (!estado || estado.nivel === 'vigente') return null
      return { ...estado, etiqueta: v.etiqueta, dias: diasPara(vehiculo[v.campo]) }
    })
    .filter(Boolean)
    .sort((a, b) => a.dias - b.dias)
}

// La alerta que se muestra en la tarjeta o en la fila: la más urgente.
const alertaPrincipal = vehiculo => alertasDe(vehiculo)[0] || null

const tieneAlerta = vehiculo => alertasDe(vehiculo).length > 0

// --- Búsqueda y filtros -----------------------------------------------------
const busqueda = ref('')
const filtroEstatus = ref([])
const soloConVencimientos = ref(false)

// Se quitan acentos y se pasa a minúsculas para que "verificacion" encuentre
// "Verificación" y "jose" encuentre "José".
const normalizar = texto => String(texto ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

// Todos los campos de texto del vehículo entran a la búsqueda, más las fechas
// ya formateadas: así se puede buscar "enero 2026" o "8 de enero".
const textoBuscable = vehiculo => normalizar([
  vehiculo.Nombre,
  vehiculo.Placas,
  vehiculo.Marca,
  vehiculo.Modelo,
  vehiculo.Serie,
  vehiculo.Color,
  vehiculo.Estatus,
  vehiculo.Notas,
  vehiculo.Aseguradora,
  vehiculo.NumeroPoliza,
  vehiculo.ResponsableNombre,
  vehiculo.EncargadoNombre,
  formatearFechaLarga(vehiculo.VigenciaSeguro),
  formatearFechaLarga(vehiculo.VigenciaVerificacion),
  formatearFechaLarga(vehiculo.VigenciaTenencia)
].filter(Boolean).join(' '))

const vehiculosFiltrados = computed(() => {
  const consulta = normalizar(busqueda.value).trim()
  const terminos = consulta ? consulta.split(/\s+/) : []

  return vehiculos.value.filter((v) => {
    // Todos los términos deben aparecer, en cualquier campo y en cualquier
    // orden: buscar "nissan azul" encuentra la Nissan de color azul.
    const texto = textoBuscable(v)
    const coincide = terminos.every(t => texto.includes(t))

    const coincideEstatus = !filtroEstatus.value.length
      || filtroEstatus.value.includes(v.Estatus)

    const coincideVencimiento = !soloConVencimientos.value || tieneAlerta(v)

    return coincide && coincideEstatus && coincideVencimiento
  })
})

const hayFiltros = computed(() =>
  !!busqueda.value.trim() || filtroEstatus.value.length > 0 || soloConVencimientos.value
)

const limpiarFiltros = () => {
  busqueda.value = ''
  filtroEstatus.value = []
  soloConVencimientos.value = false
}

// --- Indicadores ------------------------------------------------------------
// Se calculan sobre lo filtrado, para que respondan a lo que el usuario ve.
const indicadores = computed(() => {
  const lista = vehiculosFiltrados.value
  return {
    total: lista.length,
    conVencimientos: lista.filter(tieneAlerta).length,
    conPendientes: lista.filter(v => Number(v.OperacionesPendientes) > 0).length,
    gastoTotal: lista.reduce((suma, v) => suma + (Number(v.Gasto) || 0), 0)
  }
})

// --- Navegación al detalle --------------------------------------------------
const abrirDetalle = id => router.push(`/app/operaciones/flotilla/${id}`)

// --- Estatus ----------------------------------------------------------------
// El estatus del vehículo es una etiqueta operativa, no una alerta: se reserva
// el rojo y el ámbar para las vigencias, que son lo verdaderamente urgente.
// "En taller" sí lleva warning porque implica un vehículo fuera de servicio.
const colorEstatus = (estatus) => {
  if (estatus === 'En taller') return 'warning'
  if (estatus === 'Baja') return 'neutral'
  return 'primary'
}

const iconoEstatus = (estatus) => {
  if (estatus === 'En taller') return 'i-mdi-wrench-outline'
  if (estatus === 'Baja') return 'i-mdi-archive-outline'
  return 'i-mdi-check-circle-outline'
}

// --- Columnas de la vista de lista ------------------------------------------
// `w` es el ancho proporcional. La tabla usa `table-fixed`, así que estos
// anchos mandan y el contenido largo se recorta con elipsis en lugar de
// ensanchar la tabla y provocar scroll horizontal.
const encabezados = [
  { titulo: 'Foto', clave: 'Foto', ordenable: false, w: 'w-[7%]' },
  { titulo: 'Nombre', clave: 'Nombre', w: 'w-[17%]' },
  { titulo: 'Placas', clave: 'Placas', w: 'w-[9%]' },
  { titulo: 'Marca', clave: 'Marca', w: 'w-[10%]' },
  { titulo: 'Modelo', clave: 'Modelo', w: 'w-[7%]' },
  { titulo: 'Responsable', clave: 'ResponsableNombre', w: 'w-[14%]' },
  { titulo: 'Vigencia Seguro', clave: 'VigenciaSeguro', w: 'w-[15%]' },
  { titulo: 'Gasto', clave: 'Gasto', alineacion: 'end', w: 'w-[10%]' },
  { titulo: 'Estatus', clave: 'Estatus', w: 'w-[11%]' }
]

const orden = ref([])

const columnas = computed(() => encabezados.map((hdr) => {
  const ordenable = hdr.ordenable !== false
  const alineacion = hdr.alineacion === 'end' ? 'text-right' : ''
  return {
    id: hdr.clave,
    accessorKey: hdr.clave,
    enableSorting: ordenable,
    meta: {
      class: {
        th: [hdr.w, 'px-2', alineacion].filter(Boolean).join(' '),
        td: ['px-2 truncate', alineacion].filter(Boolean).join(' ')
      }
    },
    header: ordenable
      ? ({ column }) => h(UButton, {
          color: 'neutral',
          variant: 'ghost',
          size: 'xs',
          label: hdr.titulo,
          title: hdr.titulo,
          class: '-mx-1.5 max-w-full min-w-0',
          ui: { label: 'truncate' },
          trailingIcon: column.getIsSorted() === 'asc'
            ? 'i-lucide-arrow-up-narrow-wide'
            : column.getIsSorted() === 'desc'
              ? 'i-lucide-arrow-down-wide-narrow'
              : 'i-lucide-arrow-up-down',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
        })
      : hdr.titulo
  }
}))

// --- Carga de datos ---------------------------------------------------------
const cargar = async () => {
  cargando.value = true
  errorCarga.value = ''
  try {
    const res = await axios.get('/flotilla/vehiculos')
    vehiculos.value = Array.isArray(res.data) ? res.data : (res.data?.vehiculos || [])
  } catch (error) {
    console.error('Error al cargar la flotilla:', error)
    errorCarga.value = mensajeError(error, 'No se pudo cargar la flotilla.')
    toast.add({
      title: 'Error al cargar la flotilla',
      description: errorCarga.value,
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    cargando.value = false
  }
}

const cargarCatalogos = async () => {
  try {
    const res = await axios.get('/flotilla/catalogos')
    catalogos.value = {
      usuarios: res.data?.usuarios || [],
      tiposOperacion: res.data?.tiposOperacion || [],
      estatusVehiculo: res.data?.estatusVehiculo || ['Activo', 'En taller', 'Baja']
    }
  } catch (error) {
    console.error('Error al cargar los catálogos de flotilla:', error)
  }
}

// Genera los avisos de vencimiento del lado del servidor. Es un efecto
// secundario deseado al entrar a la pantalla, pero no debe bloquearla ni
// molestar al usuario si falla: se registra en consola y ya.
const revisarVencimientos = async () => {
  try {
    await axios.post('/flotilla/revisar-vencimientos')
  } catch (error) {
    console.error('No se pudieron revisar los vencimientos:', error)
  }
}

const opcionesUsuario = computed(() => catalogos.value.usuarios.map(u => ({
  label: u.FullName || u.Email,
  descripcion: u.Email,
  value: u.UserID
})))

const opcionesEstatus = computed(() => catalogos.value.estatusVehiculo)

// --- Formulario de alta y edición -------------------------------------------
const modalFormulario = ref(false)
const vehiculoEditado = ref(null)
const esEdicion = computed(() => !!vehiculoEditado.value)

const formularioVacio = () => ({
  Nombre: '',
  Placas: '',
  Marca: '',
  Modelo: '',
  Serie: '',
  Color: '',
  Estatus: 'Activo',
  Notas: '',
  Foto: null,
  Aseguradora: '',
  NumeroPoliza: '',
  VigenciaSeguro: '',
  VigenciaVerificacion: '',
  VigenciaTenencia: '',
  KilometrajeActual: null,
  KmProximoServicio: null,
  ResponsableUserID: null,
  EncargadoUserID: null
})

const formulario = ref(formularioVacio())
const errores = ref({ Nombre: '', Placas: '' })
const errorFoto = ref('')

const abrirAlta = () => {
  vehiculoEditado.value = null
  formulario.value = formularioVacio()
  if (opcionesEstatus.value.length) formulario.value.Estatus = opcionesEstatus.value[0]
  errores.value = { Nombre: '', Placas: '' }
  errorFoto.value = ''
  modalFormulario.value = true
}

const abrirEdicion = (vehiculo) => {
  vehiculoEditado.value = vehiculo
  formulario.value = {
    Nombre: vehiculo.Nombre || '',
    Placas: vehiculo.Placas || '',
    Marca: vehiculo.Marca || '',
    Modelo: vehiculo.Modelo || '',
    Serie: vehiculo.Serie || '',
    Color: vehiculo.Color || '',
    Estatus: vehiculo.Estatus || 'Activo',
    Notas: vehiculo.Notas || '',
    Foto: vehiculo.Foto || null,
    Aseguradora: vehiculo.Aseguradora || '',
    NumeroPoliza: vehiculo.NumeroPoliza || '',
    VigenciaSeguro: aValorInputFecha(vehiculo.VigenciaSeguro),
    VigenciaVerificacion: aValorInputFecha(vehiculo.VigenciaVerificacion),
    VigenciaTenencia: aValorInputFecha(vehiculo.VigenciaTenencia),
    KilometrajeActual: vehiculo.KilometrajeActual ?? null,
    KmProximoServicio: vehiculo.KmProximoServicio ?? null,
    ResponsableUserID: vehiculo.ResponsableUserID ?? null,
    EncargadoUserID: vehiculo.EncargadoUserID ?? null
  }
  errores.value = { Nombre: '', Placas: '' }
  errorFoto.value = ''
  modalFormulario.value = true
}

// --- Foto -------------------------------------------------------------------
// Las fotos salen de la cámara del celular y pesan varios megabytes. Se
// redimensionan en el navegador antes de mandarlas: 800px de lado mayor y
// calidad 0.7 dejan un data URI de unas decenas de kilobytes, suficiente para
// reconocer el vehículo y liviano para guardar y listar.
const LADO_MAXIMO = 800
const CALIDAD = 0.7

const redimensionarImagen = archivo => new Promise((resolver, rechazar) => {
  const lector = new FileReader()
  lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'))
  lector.onload = () => {
    const imagen = new Image()
    imagen.onerror = () => rechazar(new Error('El archivo no es una imagen válida.'))
    imagen.onload = () => {
      const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
      const ancho = Math.max(1, Math.round(imagen.width * escala))
      const alto = Math.max(1, Math.round(imagen.height * escala))

      const lienzo = document.createElement('canvas')
      lienzo.width = ancho
      lienzo.height = alto
      const contexto = lienzo.getContext('2d')
      // Fondo blanco: los PNG con transparencia quedarían negros al pasar a JPEG.
      contexto.fillStyle = '#ffffff'
      contexto.fillRect(0, 0, ancho, alto)
      contexto.drawImage(imagen, 0, 0, ancho, alto)

      resolver(lienzo.toDataURL('image/jpeg', CALIDAD))
    }
    imagen.src = lector.result
  }
  lector.readAsDataURL(archivo)
})

const entradaFoto = ref(null)

const seleccionarFoto = async (evento) => {
  const archivo = evento.target?.files?.[0]
  if (!archivo) return
  errorFoto.value = ''

  if (!archivo.type.startsWith('image/')) {
    errorFoto.value = 'Selecciona un archivo de imagen.'
    evento.target.value = ''
    return
  }

  try {
    formulario.value.Foto = await redimensionarImagen(archivo)
  } catch (error) {
    console.error('Error al procesar la foto:', error)
    errorFoto.value = error.message || 'No se pudo procesar la imagen.'
  } finally {
    // Se limpia el input para poder volver a elegir el mismo archivo.
    evento.target.value = ''
  }
}

const quitarFoto = () => {
  formulario.value.Foto = null
  errorFoto.value = ''
}

// --- Guardado ---------------------------------------------------------------
const cuerpoPeticion = () => {
  const f = formulario.value
  const numero = valor => (valor === '' || valor === null || valor === undefined ? null : Number(valor))
  const texto = valor => (String(valor ?? '').trim() || null)
  return {
    Nombre: f.Nombre.trim(),
    Placas: f.Placas.trim(),
    Marca: texto(f.Marca),
    Modelo: texto(f.Modelo),
    Serie: texto(f.Serie),
    Color: texto(f.Color),
    Estatus: f.Estatus,
    Notas: texto(f.Notas),
    Foto: f.Foto || null,
    Aseguradora: texto(f.Aseguradora),
    NumeroPoliza: texto(f.NumeroPoliza),
    VigenciaSeguro: f.VigenciaSeguro || null,
    VigenciaVerificacion: f.VigenciaVerificacion || null,
    VigenciaTenencia: f.VigenciaTenencia || null,
    KilometrajeActual: numero(f.KilometrajeActual),
    KmProximoServicio: numero(f.KmProximoServicio),
    ResponsableUserID: f.ResponsableUserID ?? null,
    EncargadoUserID: f.EncargadoUserID ?? null
  }
}

const guardar = async () => {
  errores.value.Nombre = formulario.value.Nombre.trim() ? '' : 'Escribe el nombre del vehículo'
  errores.value.Placas = formulario.value.Placas.trim() ? '' : 'Escribe las placas'
  if (errores.value.Nombre || errores.value.Placas) return

  guardando.value = true
  try {
    if (esEdicion.value) {
      await axios.put(`/flotilla/vehiculos/${vehiculoEditado.value.VehiculoID}`, cuerpoPeticion())
    } else {
      await axios.post('/flotilla/vehiculos', cuerpoPeticion())
    }
    modalFormulario.value = false
    toast.add({
      title: esEdicion.value ? 'Vehículo actualizado' : 'Vehículo agregado a la flotilla',
      color: 'success',
      icon: 'i-mdi-check-circle'
    })
    await cargar()
  } catch (error) {
    console.error('Error al guardar el vehículo:', error)
    toast.add({
      title: esEdicion.value ? 'No se pudo actualizar el vehículo' : 'No se pudo agregar el vehículo',
      description: mensajeError(error, 'Intenta de nuevo.'),
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    guardando.value = false
  }
}

// --- Eliminación ------------------------------------------------------------
const modalEliminar = ref(false)
const vehiculoEliminado = ref(null)

const abrirEliminacion = (vehiculo) => {
  vehiculoEliminado.value = vehiculo
  modalEliminar.value = true
}

const confirmarEliminacion = async () => {
  if (!vehiculoEliminado.value) return
  guardando.value = true
  try {
    await axios.delete(`/flotilla/vehiculos/${vehiculoEliminado.value.VehiculoID}`)
    modalEliminar.value = false
    toast.add({ title: 'Vehículo eliminado', color: 'success', icon: 'i-mdi-check-circle' })
    await cargar()
  } catch (error) {
    console.error('Error al eliminar el vehículo:', error)
    toast.add({
      title: 'No se pudo eliminar el vehículo',
      description: mensajeError(error, 'Intenta de nuevo.'),
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    guardando.value = false
  }
}

onMounted(async () => {
  const guardado = localStorage.getItem(CLAVE_VISTA)
  if (guardado === 'lista' || guardado === 'cuadricula') modoVista.value = guardado

  await Promise.all([cargar(), cargarCatalogos()])
  revisarVencimientos()
})
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tarjeta del
       listado, así los indicadores y los filtros quedan siempre a la vista. -->
  <UDashboardPanel id="operaciones-flotilla" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Flotilla" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-mdi-refresh"
            label="Actualizar"
            :loading="cargando"
            @click="cargar"
          />
          <UButton
            color="primary"
            icon="i-mdi-plus"
            label="Agregar vehículo"
            @click="abrirAlta"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="errorCarga"
        icon="i-mdi-alert-circle-outline"
        color="error"
        variant="subtle"
        class="mb-4 shrink-0"
        title="No se pudo cargar la flotilla"
        :description="errorCarga"
      />

      <!-- Indicadores. Reaccionan a los filtros: describen lo que se ve. -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 shrink-0">
        <template v-if="cargaInicial">
          <UCard v-for="i in 4" :key="`ind-skel-${i}`">
            <USkeleton class="h-8 w-20 mb-2" />
            <USkeleton class="h-3 w-32" />
          </UCard>
        </template>

        <template v-else>
          <UCard>
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <h2 class="text-3xl font-bold text-primary">
                  {{ indicadores.total }}
                </h2>
                <span class="text-sm font-medium text-muted">Vehículos</span>
              </div>
              <UIcon name="i-mdi-truck-outline" class="size-11 text-primary opacity-50 shrink-0" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <h2
                  class="text-3xl font-bold"
                  :class="indicadores.conVencimientos ? 'text-warning' : 'text-ink-700 dark:text-ink-300'"
                >
                  {{ indicadores.conVencimientos }}
                </h2>
                <span class="text-sm font-medium text-muted">Con vigencias por vencer</span>
              </div>
              <UIcon
                name="i-mdi-calendar-alert"
                class="size-11 opacity-50 shrink-0"
                :class="indicadores.conVencimientos ? 'text-warning' : 'text-ink-400'"
              />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <h2 class="text-3xl font-bold text-ink-700 dark:text-ink-300">
                  {{ indicadores.conPendientes }}
                </h2>
                <span class="text-sm font-medium text-muted">Con operaciones pendientes</span>
              </div>
              <UIcon name="i-mdi-clipboard-text-clock-outline" class="size-11 text-ink-400 opacity-50 shrink-0" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <h2 class="text-2xl font-bold text-primary truncate">
                  {{ formatearMoneda(indicadores.gastoTotal) }}
                </h2>
                <span class="text-sm font-medium text-muted">Gasto de la flotilla</span>
              </div>
              <UIcon name="i-mdi-cash-multiple" class="size-11 text-primary opacity-50 shrink-0" />
            </div>
          </UCard>
        </template>
      </div>

      <!-- La tarjeta ocupa el espacio restante y scrollea por dentro. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <!-- Barra de filtros -->
        <div class="p-3 bg-elevated/30 border-b border-default shrink-0 flex flex-wrap items-center gap-2">
          <UInput
            v-model="busqueda"
            icon="i-mdi-magnify"
            placeholder="Buscar por nombre, placas, marca, serie, responsable, póliza..."
            class="w-full sm:w-96"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="busqueda" #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-circle-x"
                aria-label="Limpiar búsqueda"
                @click="busqueda = ''"
              />
            </template>
          </UInput>

          <USelectMenu
            v-model="filtroEstatus"
            :items="opcionesEstatus"
            multiple
            icon="i-mdi-tag-outline"
            placeholder="Todos los estatus"
            class="w-full sm:w-52"
          />

          <UButton
            :color="soloConVencimientos ? 'warning' : 'neutral'"
            :variant="soloConVencimientos ? 'soft' : 'outline'"
            icon="i-mdi-calendar-alert"
            label="Sólo con vencimientos próximos"
            @click="soloConVencimientos = !soloConVencimientos"
          />

          <UButton
            v-if="hayFiltros"
            color="neutral"
            variant="link"
            size="xs"
            icon="i-lucide-circle-x"
            label="Limpiar filtros"
            @click="limpiarFiltros"
          />

          <div class="flex-1" />

          <!-- Interruptor de modo de vista -->
          <UButtonGroup>
            <UTooltip text="Ver en cuadrícula">
              <UButton
                :color="modoVista === 'cuadricula' ? 'primary' : 'neutral'"
                :variant="modoVista === 'cuadricula' ? 'solid' : 'outline'"
                icon="i-mdi-view-grid-outline"
                aria-label="Ver en cuadrícula"
                @click="modoVista = 'cuadricula'"
              />
            </UTooltip>
            <UTooltip text="Ver en lista">
              <UButton
                :color="modoVista === 'lista' ? 'primary' : 'neutral'"
                :variant="modoVista === 'lista' ? 'solid' : 'outline'"
                icon="i-mdi-view-list-outline"
                aria-label="Ver en lista"
                @click="modoVista = 'lista'"
              />
            </UTooltip>
          </UButtonGroup>
        </div>

        <!-- ===================== CUADRÍCULA ===================== -->
        <div v-if="modoVista === 'cuadricula'" class="flex-1 min-h-0 overflow-y-auto p-4">
          <!-- Carga inicial: tarjetas fantasma con la misma forma que las reales. -->
          <div
            v-if="cargaInicial"
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <div
              v-for="i in 8"
              :key="`tarjeta-skel-${i}`"
              class="rounded-xl border border-default overflow-hidden"
            >
              <USkeleton class="h-40 w-full rounded-none" />
              <div class="p-3 space-y-2">
                <USkeleton class="h-3 w-20" />
                <USkeleton class="h-5 w-40" />
                <USkeleton class="h-3 w-28" />
                <USkeleton class="h-3 w-48" />
              </div>
            </div>
          </div>

          <!-- Vacío: distingue "no hay nada" de "los filtros no dejan ver nada". -->
          <div v-else-if="!vehiculosFiltrados.length" class="py-16 px-6 text-center">
            <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
              <UIcon
                :name="hayFiltros ? 'i-lucide-filter-x' : 'i-mdi-truck-outline'"
                class="size-7 text-primary"
              />
            </div>
            <p class="font-semibold text-highlighted mb-1">
              {{ hayFiltros ? 'Ningún vehículo coincide con la búsqueda' : 'Aún no hay vehículos en la flotilla' }}
            </p>
            <p class="text-sm text-muted max-w-sm mx-auto mb-5">
              {{ hayFiltros
                ? 'Prueba con otras palabras o quita alguno de los filtros activos.'
                : 'Da de alta el primer vehículo para empezar a llevar sus vigencias, kilometraje y gastos.' }}
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
              label="Agregar el primer vehículo"
              icon="i-mdi-plus"
              color="primary"
              @click="abrirAlta"
            />
          </div>

          <div
            v-else
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <div
              v-for="vehiculo in vehiculosFiltrados"
              :key="vehiculo.VehiculoID"
              class="group relative rounded-xl border border-default bg-default overflow-hidden cursor-pointer transition-all hover:border-primary/60 hover:shadow-md"
              @click="abrirDetalle(vehiculo.VehiculoID)"
            >
              <!-- Foto: `object-contain` sobre el plato claro. Las fotos de
                   vehículos vienen en proporciones muy distintas; recortarlas
                   dejaría fuera medio coche. El plato ocupa todo el ancho para
                   que no queden franjas de otro color a los lados. -->
              <div class="foto-plato relative h-40 flex items-center justify-center p-3">
                <img
                  v-if="vehiculo.Foto"
                  :src="vehiculo.Foto"
                  :alt="vehiculo.Nombre"
                  class="max-h-full max-w-full object-contain mix-blend-multiply"
                >
                <UIcon
                  v-else
                  name="i-mdi-car-outline"
                  class="size-16 text-ink-400"
                />

                <!-- Semáforo de vencimientos. Posicionado con estilos
                     explícitos: las utilidades de posición del proyecto no
                     cubren todas las variantes. -->
                <div
                  v-if="alertaPrincipal(vehiculo)"
                  class="absolute"
                  style="top: 8px; right: 8px;"
                >
                  <UBadge
                    :color="alertaPrincipal(vehiculo).color"
                    variant="solid"
                    size="sm"
                    :icon="alertaPrincipal(vehiculo).icono"
                    class="font-semibold"
                  >
                    {{ alertaPrincipal(vehiculo).etiqueta }}
                  </UBadge>
                </div>

                <div
                  class="absolute"
                  style="top: 8px; left: 8px;"
                >
                  <UBadge
                    :color="colorEstatus(vehiculo.Estatus)"
                    variant="subtle"
                    size="sm"
                    :icon="iconoEstatus(vehiculo.Estatus)"
                  >
                    {{ vehiculo.Estatus }}
                  </UBadge>
                </div>

                <!-- Acciones: discretas hasta el hover, siempre visibles en
                     táctil (donde no existe hover, el grupo queda opaco). -->
                <div
                  class="absolute flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  style="bottom: 8px; right: 8px;"
                >
                  <UButton
                    icon="i-mdi-pencil-outline"
                    size="xs"
                    color="neutral"
                    variant="solid"
                    square
                    aria-label="Editar vehículo"
                    @click.stop="abrirEdicion(vehiculo)"
                  />
                  <UButton
                    icon="i-mdi-trash-can-outline"
                    size="xs"
                    color="error"
                    variant="solid"
                    square
                    aria-label="Eliminar vehículo"
                    @click.stop="abrirEliminacion(vehiculo)"
                  />
                </div>
              </div>

              <div class="p-3">
                <div class="text-xs font-semibold uppercase tracking-wide text-primary">
                  Modelo : {{ vehiculo.Modelo || 'Sin registrar' }}
                </div>

                <div class="text-lg font-bold text-highlighted truncate" :title="vehiculo.Nombre">
                  {{ vehiculo.Nombre }}
                </div>

                <div class="text-sm text-muted truncate">
                  Placas : {{ vehiculo.Placas || 'Sin registrar' }}
                </div>

                <div class="text-sm text-muted truncate">
                  Vigencia Seguro : {{ formatearFechaLarga(vehiculo.VigenciaSeguro) }}
                </div>

                <div
                  v-if="vehiculo.ResponsableNombre || Number(vehiculo.OperacionesPendientes) > 0"
                  class="mt-2 pt-2 border-t border-default flex items-center justify-between gap-2"
                >
                  <span
                    class="text-xs text-dimmed truncate"
                    :title="vehiculo.ResponsableNombre || ''"
                  >
                    {{ vehiculo.ResponsableNombre || 'Sin responsable' }}
                  </span>
                  <UBadge
                    v-if="Number(vehiculo.OperacionesPendientes) > 0"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    icon="i-mdi-clipboard-text-clock-outline"
                    class="shrink-0"
                  >
                    {{ vehiculo.OperacionesPendientes }}
                  </UBadge>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ======================= LISTA ======================= -->
        <UTable
          v-else
          v-model:sorting="orden"
          :data="vehiculosFiltrados"
          :columns="columnas"
          :loading="cargando"
          sticky="header"
          class="flex-1 min-h-0 overflow-y-auto"
          :ui="{
            base: 'table-fixed w-full',
            td: 'text-sm py-2',
            th: 'text-xs py-2'
          }"
          @select="(_e, row) => abrirDetalle(row.original.VehiculoID)"
        >
          <!-- Carga: filas fantasma en lugar de un spinner suelto. -->
          <template #loading>
            <div class="divide-y divide-default">
              <div
                v-for="i in 8"
                :key="`fila-skel-${i}`"
                class="flex items-center gap-4 px-2 py-3"
              >
                <USkeleton class="size-9 rounded shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-28 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
              </div>
            </div>
          </template>

          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon
                  :name="hayFiltros ? 'i-lucide-filter-x' : 'i-mdi-truck-outline'"
                  class="size-7 text-primary"
                />
              </div>
              <p class="font-semibold text-highlighted mb-1">
                {{ hayFiltros ? 'Ningún vehículo coincide con la búsqueda' : 'Aún no hay vehículos en la flotilla' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba con otras palabras o quita alguno de los filtros activos.'
                  : 'Da de alta el primer vehículo para empezar a llevar sus vigencias, kilometraje y gastos.' }}
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
                label="Agregar el primer vehículo"
                icon="i-mdi-plus"
                color="primary"
                @click="abrirAlta"
              />
            </div>
          </template>

          <template #Foto-cell="{ row }">
            <div class="foto-plato size-9 rounded flex items-center justify-center overflow-hidden">
              <img
                v-if="row.original.Foto"
                :src="row.original.Foto"
                :alt="row.original.Nombre"
                class="max-h-full max-w-full object-contain mix-blend-multiply"
              >
              <UIcon v-else name="i-mdi-car-outline" class="size-5 text-ink-400" />
            </div>
          </template>

          <template #Nombre-cell="{ row }">
            <span class="block truncate font-semibold text-primary" :title="row.original.Nombre">
              {{ row.original.Nombre }}
            </span>
          </template>

          <template #Placas-cell="{ row }">
            <span class="font-medium tabular-nums">{{ row.original.Placas || '—' }}</span>
          </template>

          <template #Marca-cell="{ row }">
            <span class="block truncate" :title="row.original.Marca || ''">
              {{ row.original.Marca || '—' }}
            </span>
          </template>

          <template #Modelo-cell="{ row }">
            <span class="tabular-nums">{{ row.original.Modelo || '—' }}</span>
          </template>

          <template #ResponsableNombre-cell="{ row }">
            <span class="block truncate text-xs" :title="row.original.ResponsableNombre || ''">
              {{ row.original.ResponsableNombre || 'Sin responsable' }}
            </span>
          </template>

          <template #VigenciaSeguro-cell="{ row }">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs whitespace-nowrap">
                {{ formatearFechaCorta(row.original.VigenciaSeguro) }}
              </span>
              <UBadge
                v-if="estadoVigencia(row.original.VigenciaSeguro) && estadoVigencia(row.original.VigenciaSeguro).nivel !== 'vigente'"
                :color="estadoVigencia(row.original.VigenciaSeguro).color"
                variant="subtle"
                size="sm"
                class="shrink-0"
                :title="estadoVigencia(row.original.VigenciaSeguro).texto"
              >
                {{ estadoVigencia(row.original.VigenciaSeguro).nivel === 'vencido' ? 'Vencido' : 'Por vencer' }}
              </UBadge>
            </div>
          </template>

          <template #Gasto-cell="{ row }">
            <span class="font-semibold tabular-nums">{{ formatearMoneda(row.original.Gasto) }}</span>
          </template>

          <template #Estatus-cell="{ row }">
            <UBadge
              :color="colorEstatus(row.original.Estatus)"
              variant="subtle"
              size="sm"
              :icon="iconoEstatus(row.original.Estatus)"
              class="max-w-full"
            >
              <span class="truncate">{{ row.original.Estatus }}</span>
            </UBadge>
          </template>
        </UTable>
      </UCard>

      <!-- ================= Alta y edición ================= -->
      <UModal
        v-model:open="modalFormulario"
        :title="esEdicion ? 'Editar vehículo' : 'Agregar vehículo'"
        :ui="{ content: 'max-w-3xl' }"
      >
        <template #body>
          <div class="space-y-5">
            <!-- Identificación -->
            <div>
              <h3 class="text-xs uppercase tracking-wide text-muted mb-2">
                Identificación
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UFormField label="Nombre" required :error="errores.Nombre">
                  <UInput
                    v-model="formulario.Nombre"
                    placeholder="Ejemplo: Camioneta de reparto 1"
                    icon="i-mdi-truck-outline"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Placas" required :error="errores.Placas">
                  <UInput
                    v-model="formulario.Placas"
                    placeholder="Ejemplo: ABC-123-D"
                    icon="i-mdi-card-text-outline"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Marca">
                  <UInput
                    v-model="formulario.Marca"
                    placeholder="Ejemplo: Nissan"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Modelo (año)">
                  <UInput
                    v-model="formulario.Modelo"
                    placeholder="Ejemplo: 2020"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Serie (VIN)">
                  <UInput
                    v-model="formulario.Serie"
                    placeholder="Número de identificación vehicular"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Color">
                  <UInput
                    v-model="formulario.Color"
                    placeholder="Ejemplo: Blanco"
                    icon="i-mdi-palette-outline"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Estatus">
                  <USelect
                    v-model="formulario.Estatus"
                    :items="opcionesEstatus"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>

            <!-- Responsables -->
            <div>
              <h3 class="text-xs uppercase tracking-wide text-muted mb-2">
                Responsables
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UFormField label="Responsable" help="Quien tiene asignado el vehículo.">
                  <USelectMenu
                    v-model="formulario.ResponsableUserID"
                    :items="opcionesUsuario"
                    value-key="value"
                    :search-input="{ placeholder: 'Buscar usuario...' }"
                    placeholder="Sin asignar"
                    icon="i-mdi-account-outline"
                    class="w-full"
                  >
                    <template #item-label="{ item }">
                      <div class="min-w-0">
                        <div class="truncate">
                          {{ item.label }}
                        </div>
                        <div class="text-xs text-muted truncate">
                          {{ item.descripcion }}
                        </div>
                      </div>
                    </template>
                  </USelectMenu>
                </UFormField>

                <UFormField label="Encargado de flotilla" help="Quien da seguimiento a sus vigencias y servicios.">
                  <USelectMenu
                    v-model="formulario.EncargadoUserID"
                    :items="opcionesUsuario"
                    value-key="value"
                    :search-input="{ placeholder: 'Buscar usuario...' }"
                    placeholder="Sin asignar"
                    icon="i-mdi-account-hard-hat-outline"
                    class="w-full"
                  >
                    <template #item-label="{ item }">
                      <div class="min-w-0">
                        <div class="truncate">
                          {{ item.label }}
                        </div>
                        <div class="text-xs text-muted truncate">
                          {{ item.descripcion }}
                        </div>
                      </div>
                    </template>
                  </USelectMenu>
                </UFormField>
              </div>
            </div>

            <!-- Documentación y vigencias -->
            <div>
              <h3 class="text-xs uppercase tracking-wide text-muted mb-2">
                Documentación y vigencias
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UFormField label="Aseguradora">
                  <UInput
                    v-model="formulario.Aseguradora"
                    placeholder="Ejemplo: Qualitas"
                    icon="i-mdi-shield-car"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Número de póliza">
                  <UInput
                    v-model="formulario.NumeroPoliza"
                    placeholder="Número de la póliza vigente"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Vigencia del seguro">
                  <UInput
                    v-model="formulario.VigenciaSeguro"
                    type="date"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Vigencia de la verificación">
                  <UInput
                    v-model="formulario.VigenciaVerificacion"
                    type="date"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Vigencia de la tenencia">
                  <UInput
                    v-model="formulario.VigenciaTenencia"
                    type="date"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>

            <!-- Kilometraje -->
            <div>
              <h3 class="text-xs uppercase tracking-wide text-muted mb-2">
                Kilometraje
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <UFormField label="Kilometraje actual">
                  <UInput
                    v-model="formulario.KilometrajeActual"
                    type="number"
                    min="0"
                    placeholder="0"
                    icon="i-mdi-speedometer"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Km del próximo servicio">
                  <UInput
                    v-model="formulario.KmProximoServicio"
                    type="number"
                    min="0"
                    placeholder="0"
                    icon="i-mdi-wrench-outline"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>

            <!-- Foto -->
            <div>
              <h3 class="text-xs uppercase tracking-wide text-muted mb-2">
                Foto
              </h3>
              <div class="flex items-start gap-4">
                <div class="foto-plato size-28 shrink-0 rounded-lg border border-default flex items-center justify-center overflow-hidden p-1.5">
                  <img
                    v-if="formulario.Foto"
                    :src="formulario.Foto"
                    alt="Vista previa del vehículo"
                    class="max-h-full max-w-full object-contain mix-blend-multiply"
                  >
                  <UIcon v-else name="i-mdi-image-outline" class="size-9 text-ink-400" />
                </div>

                <div class="min-w-0 flex-1">
                  <input
                    ref="entradaFoto"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="seleccionarFoto"
                  >

                  <div class="flex flex-wrap gap-2">
                    <UButton
                      color="neutral"
                      variant="outline"
                      icon="i-mdi-camera-outline"
                      :label="formulario.Foto ? 'Cambiar foto' : 'Elegir foto'"
                      @click="entradaFoto?.click()"
                    />
                    <UButton
                      v-if="formulario.Foto"
                      color="neutral"
                      variant="ghost"
                      icon="i-mdi-close"
                      label="Quitar"
                      @click="quitarFoto"
                    />
                  </div>

                  <p class="text-xs text-muted mt-2">
                    La imagen se reduce automáticamente a 800 px por su lado mayor
                    antes de guardarse, para que el listado cargue rápido.
                  </p>

                  <p v-if="errorFoto" class="text-xs text-error mt-1">
                    {{ errorFoto }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Notas -->
            <UFormField label="Notas">
              <UTextarea
                v-model="formulario.Notas"
                :rows="3"
                placeholder="Observaciones, accesorios, detalles del vehículo..."
                class="w-full"
              />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="modalFormulario = false">
              Cancelar
            </UButton>
            <UButton color="primary" :loading="guardando" @click="guardar">
              {{ esEdicion ? 'Guardar cambios' : 'Agregar vehículo' }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- ================= Eliminación ================= -->
      <UModal v-model:open="modalEliminar" title="Eliminar vehículo">
        <template #body>
          <div class="space-y-3">
            <p class="text-muted">
              ¿Seguro que quieres eliminar
              <b class="text-highlighted">{{ vehiculoEliminado?.Nombre }}</b>
              <span v-if="vehiculoEliminado?.Placas"> ({{ vehiculoEliminado.Placas }})</span>
              de la flotilla?
            </p>

            <UAlert
              v-if="Number(vehiculoEliminado?.OperacionesPendientes) > 0"
              icon="i-mdi-alert-outline"
              color="warning"
              variant="subtle"
              title="Este vehículo tiene operaciones pendientes"
              :description="`Quedan ${vehiculoEliminado.OperacionesPendientes} operación(es) sin cerrar. Al eliminarlo dejarán de aparecer en el seguimiento de la flotilla.`"
            />

            <p class="text-sm text-muted">
              Esta acción no se puede deshacer.
            </p>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="modalEliminar = false">
              Cancelar
            </UButton>
            <UButton color="error" :loading="guardando" @click="confirmarEliminacion">
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
