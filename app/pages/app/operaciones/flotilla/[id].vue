<script setup>
// Detalle de un vehiculo de la flotilla.
// Reune en una sola pantalla la ficha del vehiculo y sus cuatro frentes de
// seguimiento: poliza de seguro, operaciones (mantenimientos y tramites),
// gastos derivados de esas operaciones y bitacora de kilometraje.
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from '~/utils/axios'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const RUTA_LISTADO = '/app/operaciones/flotilla'

// El id de la ruta cambia cuando se navega entre vehiculos sin desmontar la
// pagina, por eso todas las cargas lo leen de este computed y no de una copia.
const vehiculoId = computed(() => route.params.id)

// --- Utilidades compartidas -------------------------------------------------

const mensajeError = (error, respaldo) =>
  error?.response?.data?.message || error?.message || respaldo

// Todos los errores del backend se muestran igual: el `message` que envia el
// servidor es el que explica el 409, el 400 de kilometraje, el 413 de tamano
// y el 415 de tipo de archivo.
const avisarError = (error, titulo, respaldo = 'Intenta de nuevo.') => {
  console.error(titulo, error)
  toast.add({
    title: titulo,
    description: mensajeError(error, respaldo),
    color: 'error',
    icon: 'i-mdi-alert-circle'
  })
}

const avisarExito = titulo =>
  toast.add({ title: titulo, color: 'success', icon: 'i-mdi-check-circle' })

const formatoMoneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN'
})

const formatearMoneda = valor => formatoMoneda.format(Number(valor) || 0)

const formatoNumero = new Intl.NumberFormat('es-MX')

const formatearNumero = valor =>
  Number.isFinite(Number(valor)) ? formatoNumero.format(Number(valor)) : '—'

// Las fechas que llegan como 'YYYY-MM-DD' se interpretarian en UTC si se
// pasaran directo a `new Date`, y en Mexico eso las corre un dia hacia atras.
// Por eso las de solo fecha se arman componente por componente en horario local.
const aFecha = (valor) => {
  if (!valor) return null
  if (typeof valor === 'string') {
    const soloFecha = valor.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (soloFecha) {
      return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    }
  }
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

const formatearFecha = (valor) => {
  const fecha = aFecha(valor)
  if (!fecha) return '—'
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
}

const formatearFechaCorta = (valor) => {
  const fecha = aFecha(valor)
  if (!fecha) return '—'
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatearFechaHora = (valor) => {
  const fecha = valor ? new Date(valor) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// Para los formularios de tipo date, que sólo aceptan 'YYYY-MM-DD'.
const aValorInput = (valor) => {
  const fecha = aFecha(valor)
  if (!fecha) return ''
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

const hoy = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Dias que faltan para una fecha. Negativo cuando ya paso.
const diasRestantes = (valor) => {
  const fecha = aFecha(valor)
  if (!fecha) return null
  fecha.setHours(0, 0, 0, 0)
  return Math.round((fecha.getTime() - hoy().getTime()) / 86400000)
}

// Semaforo unico para todos los vencimientos de la ficha (seguro, verificacion
// y tenencia), de modo que el mismo color signifique siempre lo mismo.
const colorVigencia = (valor) => {
  const dias = diasRestantes(valor)
  if (dias === null) return 'neutral'
  if (dias < 0) return 'error'
  if (dias <= 30) return 'warning'
  return 'success'
}

const textoVigencia = (valor) => {
  const dias = diasRestantes(valor)
  if (dias === null) return 'Sin fecha registrada'
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} dia(s)`
  if (dias === 0) return 'Vence hoy'
  return `Faltan ${dias} dia(s)`
}

const formatearTamano = (bytes) => {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const colorEstatusOperacion = (estatus) => {
  if (estatus === 'Completada') return 'success'
  if (estatus === 'Cancelada') return 'neutral'
  return 'primary'
}

const iconoEstatusOperacion = (estatus) => {
  if (estatus === 'Completada') return 'i-mdi-check-circle-outline'
  if (estatus === 'Cancelada') return 'i-mdi-close-circle-outline'
  return 'i-mdi-clock-outline'
}

// Una operacion pendiente cuya fecha limite ya paso es la unica situacion que
// la vista resalta por si sola.
const estaVencida = operacion =>
  operacion.Estatus === 'Pendiente'
  && operacion.FechaLimite != null
  && diasRestantes(operacion.FechaLimite) < 0

// --- Estado principal -------------------------------------------------------

const vehiculo = ref(null)
const operaciones = ref([])
const lecturas = ref([])
const documentos = ref([])
const catalogos = ref({ usuarios: [], tiposOperacion: [], estatusVehiculo: [] })

const cargando = ref(false)
const errorCarga = ref('')

// Distingue la primera carga (esqueletos) de las recargas posteriores, para que
// la ficha no parpadee cada vez que se registra una operacion o una lectura.
const cargaInicial = computed(() => cargando.value && !vehiculo.value)

const cargarCatalogos = async () => {
  try {
    const res = await axios.get('/flotilla/catalogos')
    catalogos.value = {
      usuarios: res.data?.usuarios || [],
      tiposOperacion: res.data?.tiposOperacion || [],
      estatusVehiculo: res.data?.estatusVehiculo || []
    }
  } catch (error) {
    avisarError(error, 'No se pudieron cargar los catalogos')
  }
}

const cargarTodo = async () => {
  cargando.value = true
  errorCarga.value = ''
  try {
    const [ficha, ops, kms, docs] = await Promise.all([
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}`),
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}/operaciones`),
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}/kilometraje`),
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}/documentos`)
    ])
    vehiculo.value = ficha.data || null
    operaciones.value = ops.data || []
    lecturas.value = kms.data || []
    documentos.value = docs.data || []
  } catch (error) {
    errorCarga.value = mensajeError(error, 'No se pudo cargar el vehiculo.')
    avisarError(error, 'No se pudo cargar el vehiculo')
  } finally {
    cargando.value = false
  }
}

// Recargas parciales: evitan volver a pedir toda la ficha tras cada operacion.
const recargarOperaciones = async () => {
  try {
    const [ops, ficha] = await Promise.all([
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}/operaciones`),
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}`)
    ])
    operaciones.value = ops.data || []
    // El gasto acumulado vive en la ficha, asi que se refresca con ella.
    vehiculo.value = ficha.data || vehiculo.value
  } catch (error) {
    avisarError(error, 'No se pudieron actualizar las operaciones')
  }
}

const recargarDocumentos = async () => {
  try {
    const res = await axios.get(`/flotilla/vehiculos/${vehiculoId.value}/documentos`)
    documentos.value = res.data || []
  } catch (error) {
    avisarError(error, 'No se pudieron actualizar los documentos')
  }
}

const recargarKilometraje = async () => {
  try {
    const [kms, ficha, docs] = await Promise.all([
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}/kilometraje`),
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}`),
      axios.get(`/flotilla/vehiculos/${vehiculoId.value}/documentos`)
    ])
    lecturas.value = kms.data || []
    vehiculo.value = ficha.data || vehiculo.value
    documentos.value = docs.data || []
  } catch (error) {
    avisarError(error, 'No se pudo actualizar el kilometraje')
  }
}

watch(vehiculoId, () => {
  vehiculo.value = null
  cargarTodo()
})

onMounted(() => {
  cargarCatalogos()
  cargarTodo()
})

// --- Pestanas ---------------------------------------------------------------
// `:content="false"`: los paneles se renderizan aparte para poder darles su
// propio estado de carga y de vacio.
const pestanaActiva = ref('poliza')

const pestanas = computed(() => [
  { value: 'poliza', label: 'Poliza de seguro', icon: 'i-mdi-shield-car' },
  {
    value: 'operaciones',
    label: 'Operaciones',
    icon: 'i-mdi-wrench-outline',
    badge: operaciones.value.length || undefined
  },
  { value: 'gastos', label: 'Gastos', icon: 'i-mdi-cash-multiple' },
  { value: 'kilometraje', label: 'Kilometraje', icon: 'i-mdi-speedometer' }
])

// --- Documentos: lectura y subida -------------------------------------------

const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const LIMITE_BYTES = 8 * 1024 * 1024

const documentosPoliza = computed(() =>
  documentos.value.filter(d => d.Tipo === 'Poliza')
)

const documentosPorOperacion = computed(() => {
  const mapa = new Map()
  for (const doc of documentos.value) {
    if (doc.OperacionID == null) continue
    if (!mapa.has(doc.OperacionID)) mapa.set(doc.OperacionID, [])
    mapa.get(doc.OperacionID).push(doc)
  }
  return mapa
})

const esImagen = mime => String(mime || '').startsWith('image/')
const esPdf = mime => String(mime || '') === 'application/pdf'

const iconoDocumento = (mime) => {
  if (esPdf(mime)) return 'i-mdi-file-pdf-box'
  if (esImagen(mime)) return 'i-mdi-file-image-outline'
  return 'i-mdi-file-outline'
}

// El backend puede devolver el contenido con o sin el prefijo `data:`; se
// normaliza aqui para que el visor y la descarga usen siempre un data URI.
const aDataUri = (mimeType, contenido) => {
  const texto = String(contenido || '')
  if (texto.startsWith('data:')) return texto
  return `data:${mimeType || 'application/octet-stream'};base64,${texto}`
}

// Lee un archivo del disco y devuelve su base64 sin el prefijo `data:`, que es
// lo que espera el backend en el campo `Contenido`.
const leerBase64 = archivo => new Promise((resolve, reject) => {
  const lector = new FileReader()
  lector.onerror = () => reject(new Error('No se pudo leer el archivo.'))
  lector.onload = () => {
    const resultado = String(lector.result || '')
    const coma = resultado.indexOf(',')
    resolve(coma >= 0 ? resultado.slice(coma + 1) : resultado)
  }
  lector.readAsDataURL(archivo)
})

// Validacion en el navegador para no gastar una subida completa en un archivo
// que el backend va a rechazar de todos modos con 413 o 415.
const validarArchivo = (archivo) => {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    toast.add({
      title: 'Tipo de archivo no permitido',
      description: 'Solo se aceptan archivos PDF, JPG, PNG o WEBP.',
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
    return false
  }
  if (archivo.size > LIMITE_BYTES) {
    toast.add({
      title: 'El archivo es demasiado grande',
      description: `El limite es de 8 MB y el archivo pesa ${formatearTamano(archivo.size)}.`,
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
    return false
  }
  return true
}

const subiendoDocumento = ref(false)
const inputPoliza = ref(null)

const elegirDocumentoPoliza = () => inputPoliza.value?.click()

const subirDocumento = async (archivo, tipo, operacionId = null) => {
  if (!validarArchivo(archivo)) return false
  subiendoDocumento.value = true
  try {
    const contenido = await leerBase64(archivo)
    await axios.post(`/flotilla/vehiculos/${vehiculoId.value}/documentos`, {
      Tipo: tipo,
      Nombre: archivo.name,
      MimeType: archivo.type,
      Tamano: archivo.size,
      Contenido: contenido,
      OperacionID: operacionId
    })
    avisarExito('Documento cargado')
    await recargarDocumentos()
    return true
  } catch (error) {
    avisarError(error, 'No se pudo subir el documento')
    return false
  } finally {
    subiendoDocumento.value = false
  }
}

const alSeleccionarPoliza = async (evento) => {
  const archivo = evento.target.files?.[0]
  if (archivo) await subirDocumento(archivo, 'Poliza')
  // Se limpia el input para poder volver a elegir el mismo archivo.
  evento.target.value = ''
}

// --- Visor de documentos ----------------------------------------------------
// El listado sólo trae metadatos; el contenido se pide al abrir para no cargar
// megabytes de base64 que quiza nunca se vean.

const visorAbierto = ref(false)
const visorCargando = ref(false)
const visorDocumento = ref(null)
const visorDataUri = ref('')
const visorError = ref('')

const abrirDocumento = async (documento) => {
  visorDocumento.value = documento
  visorDataUri.value = ''
  visorError.value = ''
  visorAbierto.value = true
  visorCargando.value = true
  try {
    const res = await axios.get(`/flotilla/documentos/${documento.DocumentoID}`)
    const datos = res.data || {}
    visorDataUri.value = aDataUri(datos.MimeType || documento.MimeType, datos.Contenido)
    visorDocumento.value = {
      ...documento,
      Nombre: datos.Nombre || documento.Nombre,
      MimeType: datos.MimeType || documento.MimeType
    }
  } catch (error) {
    visorError.value = mensajeError(error, 'No se pudo abrir el documento.')
    avisarError(error, 'No se pudo abrir el documento')
  } finally {
    visorCargando.value = false
  }
}

// La descarga reutiliza el data URI ya cargado en el visor; si se pide desde la
// lista sin abrirlo antes, primero se recupera el contenido.
const descargarDocumento = async (documento, dataUri = '') => {
  try {
    let uri = dataUri
    let nombre = documento?.Nombre || 'documento'
    if (!uri) {
      const res = await axios.get(`/flotilla/documentos/${documento.DocumentoID}`)
      const datos = res.data || {}
      uri = aDataUri(datos.MimeType || documento.MimeType, datos.Contenido)
      nombre = datos.Nombre || nombre
    }
    const enlace = document.createElement('a')
    enlace.href = uri
    enlace.download = nombre
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
  } catch (error) {
    avisarError(error, 'No se pudo descargar el documento')
  }
}

const confirmarBorrarDoc = ref(false)
const documentoABorrar = ref(null)
const borrandoDocumento = ref(false)

const pedirBorrarDocumento = (documento) => {
  documentoABorrar.value = documento
  confirmarBorrarDoc.value = true
}

const borrarDocumento = async () => {
  if (!documentoABorrar.value) return
  borrandoDocumento.value = true
  try {
    await axios.delete(`/flotilla/documentos/${documentoABorrar.value.DocumentoID}`)
    confirmarBorrarDoc.value = false
    // Si el visor tenia abierto justo ese documento, se cierra.
    if (visorDocumento.value?.DocumentoID === documentoABorrar.value.DocumentoID) {
      visorAbierto.value = false
    }
    avisarExito('Documento eliminado')
    await recargarDocumentos()
  } catch (error) {
    avisarError(error, 'No se pudo eliminar el documento')
  } finally {
    borrandoDocumento.value = false
  }
}

// --- Edicion de la ficha ----------------------------------------------------

const modalEditar = ref(false)
const guardandoVehiculo = ref(false)
// El formulario cubre los mismos campos que el del listado, salvo el
// kilometraje actual: ese se captura en su pestaña, que valida que no retroceda
// y deja lectura en el historial. Editarlo a mano aqui se saltaria ambas cosas.
const formVehiculo = ref({
  Nombre: '', Placas: '', Marca: '', Modelo: '', Serie: '', Color: '',
  Estatus: '', Notas: '', Aseguradora: '', NumeroPoliza: '',
  VigenciaSeguro: '', VigenciaVerificacion: '', VigenciaTenencia: '',
  KmProximoServicio: null,
  ResponsableUserID: null, EncargadoUserID: null, Foto: null
})

const errorFotoVehiculo = ref('')

const abrirEdicion = () => {
  const v = vehiculo.value || {}
  formVehiculo.value = {
    Nombre: v.Nombre || '',
    Placas: v.Placas || '',
    Marca: v.Marca || '',
    Modelo: v.Modelo || '',
    Serie: v.Serie || '',
    Color: v.Color || '',
    Estatus: v.Estatus || '',
    Notas: v.Notas || '',
    Aseguradora: v.Aseguradora || '',
    NumeroPoliza: v.NumeroPoliza || '',
    VigenciaSeguro: aValorInput(v.VigenciaSeguro),
    VigenciaVerificacion: aValorInput(v.VigenciaVerificacion),
    VigenciaTenencia: aValorInput(v.VigenciaTenencia),
    KmProximoServicio: v.KmProximoServicio ?? null,
    ResponsableUserID: v.ResponsableUserID ?? null,
    EncargadoUserID: v.EncargadoUserID ?? null,
    Foto: v.Foto || null
  }
  errorFotoVehiculo.value = ''
  modalEditar.value = true
}

const entradaFotoVehiculo = ref(null)

const seleccionarFotoVehiculo = async (evento) => {
  const archivo = evento.target.files?.[0]
  if (!archivo) return
  errorFotoVehiculo.value = ''
  if (!archivo.type.startsWith('image/')) {
    errorFotoVehiculo.value = 'Selecciona un archivo de imagen.'
    evento.target.value = ''
    return
  }
  try {
    formVehiculo.value.Foto = await redimensionarImagen(archivo)
  } catch (error) {
    errorFotoVehiculo.value = error.message || 'No se pudo procesar la imagen.'
  }
  evento.target.value = ''
}

const guardarVehiculo = async () => {
  guardandoVehiculo.value = true
  try {
    const cuerpo = { ...formVehiculo.value }
    // Las fechas vacias se mandan como null, no como cadena vacia.
    for (const campo of ['VigenciaSeguro', 'VigenciaVerificacion', 'VigenciaTenencia']) {
      cuerpo[campo] = cuerpo[campo] || null
    }
    cuerpo.KmProximoServicio = cuerpo.KmProximoServicio === '' || cuerpo.KmProximoServicio == null
      ? null
      : Number(cuerpo.KmProximoServicio)
    await axios.put(`/flotilla/vehiculos/${vehiculoId.value}`, cuerpo)
    modalEditar.value = false
    avisarExito('Vehiculo actualizado')
    await cargarTodo()
  } catch (error) {
    avisarError(error, 'No se pudo actualizar el vehiculo')
  } finally {
    guardandoVehiculo.value = false
  }
}

// --- Operaciones ------------------------------------------------------------

const opcionesTipo = computed(() => {
  const tipos = catalogos.value.tiposOperacion || []
  return tipos.map(t => (typeof t === 'string' ? t : (t.value ?? t.label ?? t.Nombre ?? String(t))))
})

const opcionesEstatusVehiculo = computed(() => {
  const estatus = catalogos.value.estatusVehiculo || []
  return estatus.map(e => (typeof e === 'string' ? e : (e.value ?? e.label ?? e.Nombre ?? String(e))))
})

const opcionesResponsable = computed(() =>
  (catalogos.value.usuarios || []).map(u => ({
    label: u.FullName || `Usuario ${u.UserID}`,
    value: u.UserID
  }))
)

const modalOperacion = ref(false)
const guardandoOperacion = ref(false)
const operacionEditada = ref(null)

const formOperacionVacio = () => ({
  Tipo: null,
  Accion: '',
  Precio: null,
  FechaLimite: '',
  Notas: '',
  Proveedor: '',
  ResponsableUserID: null,
  Estatus: 'Pendiente'
})

const formOperacion = ref(formOperacionVacio())
const erroresOperacion = ref({ Tipo: '', Accion: '', FechaLimite: '', ResponsableUserID: '' })

const abrirNuevaOperacion = () => {
  operacionEditada.value = null
  formOperacion.value = formOperacionVacio()
  erroresOperacion.value = { Tipo: '', Accion: '', FechaLimite: '', ResponsableUserID: '' }
  modalOperacion.value = true
}

const abrirEdicionOperacion = (operacion) => {
  operacionEditada.value = operacion
  formOperacion.value = {
    Tipo: operacion.Tipo || null,
    Accion: operacion.Accion || '',
    Precio: operacion.Precio ?? null,
    FechaLimite: aValorInput(operacion.FechaLimite),
    Notas: operacion.Notas || '',
    Proveedor: operacion.Proveedor || '',
    ResponsableUserID: operacion.ResponsableUserID ?? null,
    Estatus: operacion.Estatus || 'Pendiente'
  }
  erroresOperacion.value = { Tipo: '', Accion: '', FechaLimite: '', ResponsableUserID: '' }
  modalOperacion.value = true
}

const guardarOperacion = async () => {
  const f = formOperacion.value
  erroresOperacion.value = {
    Tipo: f.Tipo ? '' : 'Selecciona el tipo de operacion',
    Accion: f.Accion.trim() ? '' : 'Describe la accion a tomar',
    FechaLimite: f.FechaLimite ? '' : 'Indica cuando debe quedar finalizada',
    ResponsableUserID: f.ResponsableUserID != null ? '' : 'Asigna un responsable interno'
  }
  if (Object.values(erroresOperacion.value).some(Boolean)) return

  guardandoOperacion.value = true
  try {
    const cuerpo = {
      Tipo: f.Tipo,
      Accion: f.Accion.trim(),
      Precio: f.Precio === '' || f.Precio == null ? null : Number(f.Precio),
      FechaLimite: f.FechaLimite || null,
      Notas: f.Notas.trim() || null,
      Proveedor: f.Proveedor.trim() || null,
      ResponsableUserID: f.ResponsableUserID
    }
    if (operacionEditada.value) {
      await axios.put(`/flotilla/operaciones/${operacionEditada.value.OperacionID}`, {
        ...cuerpo,
        Estatus: f.Estatus
      })
      avisarExito('Operacion actualizada')
    } else {
      await axios.post(`/flotilla/vehiculos/${vehiculoId.value}/operaciones`, cuerpo)
      avisarExito('Operacion registrada')
    }
    modalOperacion.value = false
    await recargarOperaciones()
  } catch (error) {
    avisarError(error, operacionEditada.value
      ? 'No se pudo actualizar la operacion'
      : 'No se pudo registrar la operacion')
  } finally {
    guardandoOperacion.value = false
  }
}

// Completar una operacion no abre el modal: reenvia la misma operacion con el
// estatus cambiado, que es lo unico que se modifica.
const completandoId = ref(null)

const completarOperacion = async (operacion) => {
  completandoId.value = operacion.OperacionID
  try {
    await axios.put(`/flotilla/operaciones/${operacion.OperacionID}`, {
      Tipo: operacion.Tipo,
      Accion: operacion.Accion,
      Precio: operacion.Precio,
      FechaLimite: operacion.FechaLimite,
      Notas: operacion.Notas,
      Proveedor: operacion.Proveedor,
      ResponsableUserID: operacion.ResponsableUserID,
      Estatus: 'Completada'
    })
    avisarExito('Operacion marcada como completada')
    await recargarOperaciones()
  } catch (error) {
    avisarError(error, 'No se pudo completar la operacion')
  } finally {
    completandoId.value = null
  }
}

const confirmarBorrarOp = ref(false)
const operacionABorrar = ref(null)
const borrandoOperacion = ref(false)

const pedirBorrarOperacion = (operacion) => {
  operacionABorrar.value = operacion
  confirmarBorrarOp.value = true
}

const borrarOperacion = async () => {
  if (!operacionABorrar.value) return
  borrandoOperacion.value = true
  try {
    await axios.delete(`/flotilla/operaciones/${operacionABorrar.value.OperacionID}`)
    confirmarBorrarOp.value = false
    avisarExito('Operacion eliminada')
    await Promise.all([recargarOperaciones(), recargarDocumentos()])
  } catch (error) {
    avisarError(error, 'No se pudo eliminar la operacion')
  } finally {
    borrandoOperacion.value = false
  }
}

// Adjuntar una factura directamente a una operacion desde su tarjeta.
const inputFactura = ref(null)
const operacionParaFactura = ref(null)

const elegirFactura = (operacion) => {
  operacionParaFactura.value = operacion
  inputFactura.value?.click()
}

const alSeleccionarFactura = async (evento) => {
  const archivo = evento.target.files?.[0]
  if (archivo && operacionParaFactura.value) {
    await subirDocumento(archivo, 'Factura', operacionParaFactura.value.OperacionID)
  }
  operacionParaFactura.value = null
  evento.target.value = ''
}

// Operaciones ordenadas: primero las pendientes vencidas, luego el resto de
// pendientes por fecha limite, y al final las cerradas.
const operacionesOrdenadas = computed(() => {
  const peso = (op) => {
    if (estaVencida(op)) return 0
    if (op.Estatus === 'Pendiente') return 1
    return 2
  }
  return [...operaciones.value].sort((a, b) => {
    const dif = peso(a) - peso(b)
    if (dif !== 0) return dif
    const fa = aFecha(a.FechaLimite)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const fb = aFecha(b.FechaLimite)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return fa - fb
  })
})

const resumenOperaciones = computed(() => ({
  pendientes: operaciones.value.filter(o => o.Estatus === 'Pendiente').length,
  vencidas: operaciones.value.filter(estaVencida).length,
  completadas: operaciones.value.filter(o => o.Estatus === 'Completada').length
}))

// --- Gastos -----------------------------------------------------------------
// El gasto del vehiculo no se captura aparte: sale del precio de las operaciones
// registradas. Las canceladas no suman porque no representan un desembolso.

const operacionesConGasto = computed(() =>
  operaciones.value.filter(o => o.Estatus !== 'Cancelada' && Number(o.Precio) > 0)
)

const totalGastos = computed(() =>
  operacionesConGasto.value.reduce((suma, o) => suma + Number(o.Precio || 0), 0)
)

const gastoComprometido = computed(() =>
  operacionesConGasto.value
    .filter(o => o.Estatus === 'Pendiente')
    .reduce((suma, o) => suma + Number(o.Precio || 0), 0)
)

const gastoEjercido = computed(() =>
  operacionesConGasto.value
    .filter(o => o.Estatus === 'Completada')
    .reduce((suma, o) => suma + Number(o.Precio || 0), 0)
)

// Subtotales por tipo, de mayor a menor, con el porcentaje que representan
// sobre el total para dibujar la barra de proporcion.
const gastosPorTipo = computed(() => {
  const mapa = new Map()
  for (const op of operacionesConGasto.value) {
    const tipo = op.Tipo || 'Sin tipo'
    const actual = mapa.get(tipo) || { tipo, monto: 0, conteo: 0 }
    actual.monto += Number(op.Precio || 0)
    actual.conteo += 1
    mapa.set(tipo, actual)
  }
  const total = totalGastos.value || 1
  return [...mapa.values()]
    .map(g => ({ ...g, porcentaje: (g.monto / total) * 100 }))
    .sort((a, b) => b.monto - a.monto)
})

// El detalle se ordena por fecha limite descendente: lo mas reciente arriba.
const detalleGastos = computed(() =>
  [...operacionesConGasto.value].sort((a, b) => {
    const fa = aFecha(a.FechaCompletada || a.FechaLimite || a.CreatedAt)?.getTime() ?? 0
    const fb = aFecha(b.FechaCompletada || b.FechaLimite || b.CreatedAt)?.getTime() ?? 0
    return fb - fa
  })
)

// Colores categoricos de la paleta de marca: distinguen tipos de gasto sin
// significar estado. Se recorren ciclicamente.
const COLORES_CATEGORIA = [
  'var(--color-cat-1)', 'var(--color-cat-2)', 'var(--color-cat-3)', 'var(--color-cat-4)',
  'var(--color-cat-5)', 'var(--color-cat-6)', 'var(--color-cat-7)', 'var(--color-cat-8)'
]

const colorCategoria = indice => COLORES_CATEGORIA[indice % COLORES_CATEGORIA.length]

// --- Kilometraje ------------------------------------------------------------

// Lecturas de la mas reciente a la mas antigua, con los km recorridos respecto
// a la lectura anterior ya calculados.
const lecturasOrdenadas = computed(() => {
  const orden = [...lecturas.value].sort((a, b) => {
    const fa = new Date(a.Fecha).getTime() || 0
    const fb = new Date(b.Fecha).getTime() || 0
    return fa - fb
  })
  const conRecorrido = orden.map((lectura, i) => ({
    ...lectura,
    recorrido: i === 0 ? null : Number(lectura.Kilometraje) - Number(orden[i - 1].Kilometraje)
  }))
  return conRecorrido.reverse()
})

const ultimaLectura = computed(() => lecturasOrdenadas.value[0] || null)

const kilometrajeActual = computed(() =>
  vehiculo.value?.KilometrajeActual ?? ultimaLectura.value?.Kilometraje ?? null
)

// Km que faltan para el proximo servicio. Negativo significa que ya se paso.
const kmParaServicio = computed(() => {
  const objetivo = Number(vehiculo.value?.KmProximoServicio)
  const actual = Number(kilometrajeActual.value)
  if (!Number.isFinite(objetivo) || !Number.isFinite(actual) || !objetivo) return null
  return objetivo - actual
})

const colorServicio = computed(() => {
  const faltan = kmParaServicio.value
  if (faltan === null) return 'neutral'
  if (faltan <= 0) return 'error'
  if (faltan <= 1000) return 'warning'
  return 'success'
})

const formKilometraje = ref({ Kilometraje: null, Notas: '' })
const erroresKilometraje = ref({ Kilometraje: '', Comprobante: '' })
const guardandoLectura = ref(false)

const inputComprobante = ref(null)
const comprobante = ref(null) // { nombre, mimeType, tamano, contenido, vistaPrevia }

const elegirComprobante = () => inputComprobante.value?.click()

// El comprobante de kilometraje es siempre una foto del tablero, asi que se
// redimensiona en el navegador antes de enviarlo: el limite de 8 MB del backend
// se rebasa facil con una camara de telefono, y para leer un odometro no hace
// falta mas de 1200 px.
const redimensionarImagen = (archivo, maximo = 1200, calidad = 0.7) => new Promise((resolve, reject) => {
  const lector = new FileReader()
  lector.onerror = () => reject(new Error('No se pudo leer la imagen.'))
  lector.onload = () => {
    const imagen = new Image()
    imagen.onerror = () => reject(new Error('El archivo no es una imagen valida.'))
    imagen.onload = () => {
      const escala = Math.min(1, maximo / Math.max(imagen.width, imagen.height))
      const ancho = Math.round(imagen.width * escala)
      const alto = Math.round(imagen.height * escala)
      const lienzo = document.createElement('canvas')
      lienzo.width = ancho
      lienzo.height = alto
      const ctx = lienzo.getContext('2d')
      ctx.drawImage(imagen, 0, 0, ancho, alto)
      resolve(lienzo.toDataURL('image/jpeg', calidad))
    }
    imagen.src = String(lector.result || '')
  }
  lector.readAsDataURL(archivo)
})

const alSeleccionarComprobante = async (evento) => {
  const archivo = evento.target.files?.[0]
  evento.target.value = ''
  if (!archivo) return
  if (!String(archivo.type).startsWith('image/')) {
    toast.add({
      title: 'El comprobante debe ser una imagen',
      description: 'Toma una foto del tablero en formato JPG, PNG o WEBP.',
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
    return
  }
  try {
    const dataUri = await redimensionarImagen(archivo)
    const contenido = dataUri.slice(dataUri.indexOf(',') + 1)
    // El tamano que se reporta es el del archivo ya reducido, no el original:
    // base64 ocupa 4 bytes por cada 3 de binario.
    comprobante.value = {
      nombre: archivo.name.replace(/\.[^.]+$/, '') + '.jpg',
      mimeType: 'image/jpeg',
      tamano: Math.round(contenido.length * 0.75),
      contenido,
      vistaPrevia: dataUri
    }
    erroresKilometraje.value.Comprobante = ''
  } catch (error) {
    avisarError(error, 'No se pudo procesar la imagen')
  }
}

const quitarComprobante = () => { comprobante.value = null }

const registrarLectura = async () => {
  const km = Number(formKilometraje.value.Kilometraje)
  erroresKilometraje.value = {
    Kilometraje: Number.isFinite(km) && km > 0 ? '' : 'Captura el kilometraje del tablero',
    Comprobante: comprobante.value ? '' : 'Adjunta la foto del tablero'
  }
  if (Object.values(erroresKilometraje.value).some(Boolean)) return

  guardandoLectura.value = true
  try {
    await axios.post(`/flotilla/vehiculos/${vehiculoId.value}/kilometraje`, {
      Kilometraje: km,
      Notas: formKilometraje.value.Notas.trim() || null,
      Comprobante: {
        Nombre: comprobante.value.nombre,
        MimeType: comprobante.value.mimeType,
        Tamano: comprobante.value.tamano,
        Contenido: comprobante.value.contenido
      }
    })
    formKilometraje.value = { Kilometraje: null, Notas: '' }
    comprobante.value = null
    avisarExito('Lectura registrada')
    await recargarKilometraje()
  } catch (error) {
    // El 400 mas comun es "la lectura es menor a la ultima registrada"; el
    // mensaje del backend es el que lo explica, asi que se muestra tal cual.
    avisarError(error, 'No se pudo registrar la lectura')
  } finally {
    guardandoLectura.value = false
  }
}

// El comprobante de una lectura se abre con el mismo visor que el resto de los
// documentos; aqui sólo se localiza su metadato.
const documentoDeLectura = (lectura) => {
  if (lectura.DocumentoID == null) return null
  return documentos.value.find(d => d.DocumentoID === lectura.DocumentoID) || {
    DocumentoID: lectura.DocumentoID,
    Nombre: 'Comprobante de kilometraje',
    MimeType: 'image/jpeg'
  }
}

// --- Presentacion de la ficha ----------------------------------------------

const iniciales = computed(() => {
  const texto = String(vehiculo.value?.Placas || vehiculo.value?.Nombre || '?').trim()
  return texto.slice(0, 3).toUpperCase()
})

const colorEstatusVehiculo = (estatus) => {
  const texto = String(estatus || '').toLowerCase()
  if (texto.includes('baja') || texto.includes('siniestr')) return 'error'
  if (texto.includes('taller') || texto.includes('manten')) return 'warning'
  if (texto.includes('activo') || texto.includes('disponible')) return 'success'
  return 'neutral'
}

// Datos generales de la ficha, en el orden en que se leen. Se arma como lista
// para no repetir el mismo bloque de etiqueta y valor doce veces en la plantilla.
const datosGenerales = computed(() => {
  const v = vehiculo.value || {}
  return [
    { etiqueta: 'Placas', valor: v.Placas || '—', destacado: true },
    { etiqueta: 'Nombre', valor: v.Nombre || '—' },
    { etiqueta: 'Marca', valor: v.Marca || '—' },
    { etiqueta: 'Modelo', valor: v.Modelo || '—' },
    { etiqueta: 'Serie', valor: v.Serie || '—' },
    { etiqueta: 'Color', valor: v.Color || '—' },
    { etiqueta: 'Responsable', valor: v.ResponsableNombre || 'Sin asignar' },
    { etiqueta: 'Encargado de flotilla', valor: v.EncargadoNombre || 'Sin asignar' },
    { etiqueta: 'Gasto acumulado', valor: formatearMoneda(v.Gasto) },
    {
      etiqueta: 'Kilometraje actual',
      valor: kilometrajeActual.value != null ? `${formatearNumero(kilometrajeActual.value)} KM` : '—'
    },
    { etiqueta: 'Vigencia del seguro', valor: formatearFecha(v.VigenciaSeguro), vigencia: v.VigenciaSeguro },
    { etiqueta: 'Vigencia de verificacion', valor: formatearFecha(v.VigenciaVerificacion), vigencia: v.VigenciaVerificacion },
    { etiqueta: 'Vigencia de tenencia', valor: formatearFecha(v.VigenciaTenencia), vigencia: v.VigenciaTenencia },
    {
      etiqueta: 'Proximo servicio',
      valor: v.KmProximoServicio ? `${formatearNumero(v.KmProximoServicio)} KM` : 'Sin programar'
    }
  ]
})
</script>

<template>
  <UDashboardPanel id="flotilla-vehiculo-detalle">
    <template #header>
      <UDashboardNavbar :title="vehiculo?.Nombre || 'Vehiculo'" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-mdi-arrow-left"
            label="Volver al listado"
            @click="router.push(RUTA_LISTADO)"
          />
          <UButton
            color="primary"
            icon="i-mdi-pencil"
            label="Editar"
            :disabled="!vehiculo"
            @click="abrirEdicion"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="errorCarga && !vehiculo"
        icon="i-mdi-alert-circle-outline"
        color="error"
        variant="subtle"
        class="mb-4"
        title="No se pudo cargar el vehiculo"
        :description="errorCarga"
      />

      <!-- Carga inicial: la ficha completa en esqueleto. -->
      <template v-if="cargaInicial">
        <UCard class="mb-4" :ui="{ body: 'p-0 sm:p-0' }">
          <USkeleton class="h-40 w-full rounded-none" />
          <div class="flex flex-col items-center px-6 pb-6" style="margin-top: -3rem">
            <USkeleton class="size-24 rounded-full" />
            <USkeleton class="h-7 w-56 mt-4" />
            <USkeleton class="h-4 w-32 mt-2" />
          </div>
        </UCard>

        <UCard class="mb-4">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div v-for="i in 8" :key="`dato-skel-${i}`">
              <USkeleton class="h-3 w-20 mb-2" />
              <USkeleton class="h-5 w-32" />
            </div>
          </div>
        </UCard>

        <UCard>
          <USkeleton class="h-10 w-full mb-6" />
          <USkeleton v-for="i in 4" :key="`tab-skel-${i}`" class="h-16 w-full mb-3" />
        </UCard>
      </template>

      <template v-else-if="vehiculo">
        <!-- 1. Encabezado tipo ficha -->
        <UCard class="mb-4" :ui="{ body: 'p-0 sm:p-0' }">
          <!-- La banda no muestra la foto legible: la usa desenfocada como
               ambiente, bajo un velo del color de la empresa. Recortarla con
               object-cover dejaba fuera medio vehiculo y, al venir casi todas
               sobre fondo blanco de estudio, el velo oscuro las volvia un gris
               sucio. Asi la banda es consistente entre vehiculos y el texto de
               encima siempre tiene contraste. -->
          <div class="relative h-36 sm:h-44 overflow-hidden">
            <img
              v-if="vehiculo.Foto"
              :src="vehiculo.Foto"
              alt=""
              aria-hidden="true"
              class="banda-foto absolute inset-0 w-full h-full object-cover"
            >
            <div class="banda-velo absolute inset-0" />

            <!-- Estatus sobre la banda: es el dato que se busca de un vistazo. -->
            <div class="absolute" style="top: 0.75rem; right: 0.75rem">
              <UBadge
                :color="colorEstatusVehiculo(vehiculo.Estatus)"
                variant="solid"
                size="lg"
              >
                {{ vehiculo.Estatus || 'Sin estatus' }}
              </UBadge>
            </div>
          </div>

          <!-- La foto es el protagonista de la ficha: al entrar al vehiculo, lo
               primero que se quiere reconocer es cual es. Por eso va en un panel
               amplio y nitido montado sobre la banda, y no en un circulo del
               tamano de un avatar. El panel es claro para que el fondo blanco de
               estudio de las fotos se funda con el, y monta con margen negativo
               para que el bloque de texto de abajo se acomode solo. -->
          <div class="flex flex-col items-center px-4 sm:px-6 pb-6" style="margin-top: -5rem">
            <div class="foto-panel w-full rounded-2xl" style="max-width: 34rem; padding: 5px">
              <div class="foto-plato rounded-xl flex items-center justify-center overflow-hidden h-44 sm:h-56 p-4">
                <img
                  v-if="vehiculo.Foto"
                  :src="vehiculo.Foto"
                  :alt="`Foto de ${vehiculo.Nombre}`"
                  class="max-h-full max-w-full object-contain mix-blend-multiply"
                >
                <div v-else class="flex flex-col items-center gap-2 text-ink-400">
                  <UIcon name="i-mdi-car-outline" class="size-16" />
                  <span class="text-sm font-medium">{{ iniciales }}</span>
                </div>
              </div>
            </div>

            <h1 class="mt-4 text-2xl sm:text-3xl font-bold text-highlighted text-center">
              {{ vehiculo.Nombre || 'Vehiculo sin nombre' }}
            </h1>

            <div class="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
              <span v-if="vehiculo.Placas" class="font-mono font-semibold tracking-wider text-highlighted">
                {{ vehiculo.Placas }}
              </span>
              <span v-if="vehiculo.Placas && (vehiculo.Marca || vehiculo.Modelo)">·</span>
              <span>{{ [vehiculo.Marca, vehiculo.Modelo].filter(Boolean).join(' ') || 'Sin marca ni modelo' }}</span>
            </div>

            <p v-if="vehiculo.Notas" class="mt-3 max-w-2xl text-center text-sm text-muted">
              {{ vehiculo.Notas }}
            </p>
          </div>
        </UCard>

        <!-- 2. Datos generales -->
        <UCard class="mb-4">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-mdi-card-account-details-outline" class="text-primary size-5" />
              <span class="font-semibold text-highlighted">Datos generales</span>
            </div>
          </template>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            <div v-for="dato in datosGenerales" :key="dato.etiqueta" class="min-w-0">
              <div class="text-xs uppercase tracking-wide text-muted mb-1">
                {{ dato.etiqueta }}
              </div>
              <div
                class="truncate"
                :class="dato.destacado
                  ? 'font-mono font-bold tracking-wider text-highlighted'
                  : 'font-medium text-highlighted'"
                :title="dato.valor"
              >
                {{ dato.valor }}
              </div>
              <!-- Los vencimientos llevan el semaforo de dias restantes debajo
                   del valor: la fecha sola no dice si urge o no. -->
              <div
                v-if="dato.vigencia !== undefined"
                class="text-xs mt-0.5"
                :class="{
                  'text-error': colorVigencia(dato.vigencia) === 'error',
                  'text-warning': colorVigencia(dato.vigencia) === 'warning',
                  'text-success': colorVigencia(dato.vigencia) === 'success',
                  'text-dimmed': colorVigencia(dato.vigencia) === 'neutral'
                }"
              >
                {{ textoVigencia(dato.vigencia) }}
              </div>
            </div>
          </div>
        </UCard>

        <!-- 3. Pestanas -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="px-4 pt-4 border-b border-default">
            <UTabs
              v-model="pestanaActiva"
              :items="pestanas"
              :content="false"
              color="primary"
              variant="link"
              class="w-full"
            />
          </div>

          <div class="p-4 sm:p-6">
            <!-- ===== a) Poliza de seguro ===== -->
            <div v-if="pestanaActiva === 'poliza'" class="space-y-6">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="rounded-lg border border-default p-4">
                  <div class="text-xs uppercase tracking-wide text-muted mb-1">
                    Aseguradora
                  </div>
                  <div class="font-semibold text-highlighted truncate">
                    {{ vehiculo.Aseguradora || 'Sin registrar' }}
                  </div>
                </div>

                <div class="rounded-lg border border-default p-4">
                  <div class="text-xs uppercase tracking-wide text-muted mb-1">
                    Numero de poliza
                  </div>
                  <div class="font-mono font-semibold text-highlighted truncate">
                    {{ vehiculo.NumeroPoliza || 'Sin registrar' }}
                  </div>
                </div>

                <div
                  class="rounded-lg border p-4"
                  :class="{
                    'border-error/50 bg-error/5': colorVigencia(vehiculo.VigenciaSeguro) === 'error',
                    'border-warning/50 bg-warning/5': colorVigencia(vehiculo.VigenciaSeguro) === 'warning',
                    'border-default': ['success', 'neutral'].includes(colorVigencia(vehiculo.VigenciaSeguro))
                  }"
                >
                  <div class="text-xs uppercase tracking-wide text-muted mb-1">
                    Vigencia
                  </div>
                  <div class="font-semibold text-highlighted">
                    {{ formatearFecha(vehiculo.VigenciaSeguro) }}
                  </div>
                  <UBadge
                    :color="colorVigencia(vehiculo.VigenciaSeguro)"
                    variant="subtle"
                    size="sm"
                    class="mt-2"
                  >
                    {{ textoVigencia(vehiculo.VigenciaSeguro) }}
                  </UBadge>
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between gap-2 mb-3">
                  <h3 class="font-semibold text-highlighted">
                    Documentos de la poliza
                  </h3>
                  <UButton
                    color="primary"
                    variant="subtle"
                    icon="i-mdi-upload"
                    label="Subir documento"
                    :loading="subiendoDocumento"
                    @click="elegirDocumentoPoliza"
                  />
                  <input
                    ref="inputPoliza"
                    type="file"
                    class="hidden"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    @change="alSeleccionarPoliza"
                  >
                </div>

                <!-- Vacio contextual: aqui lo util es explicar que se espera un
                     PDF de la caratula, no sólo decir que no hay nada. -->
                <div
                  v-if="!documentosPoliza.length"
                  class="rounded-lg border border-dashed border-default py-10 px-6 text-center"
                >
                  <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                    <UIcon name="i-mdi-shield-car" class="size-7 text-primary" />
                  </div>
                  <p class="font-semibold text-highlighted mb-1">
                    Sin documentos de poliza
                  </p>
                  <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                    Adjunta la caratula de la poliza en PDF o una foto de la tarjeta
                    de circulacion para tenerla a la mano en carretera.
                  </p>
                  <UButton
                    color="primary"
                    variant="subtle"
                    icon="i-mdi-upload"
                    label="Subir documento"
                    :loading="subiendoDocumento"
                    @click="elegirDocumentoPoliza"
                  />
                </div>

                <div v-else class="divide-y divide-default rounded-lg border border-default">
                  <div
                    v-for="doc in documentosPoliza"
                    :key="doc.DocumentoID"
                    class="flex items-center gap-3 p-3"
                  >
                    <UIcon :name="iconoDocumento(doc.MimeType)" class="size-8 shrink-0 text-primary" />

                    <div class="min-w-0 flex-1">
                      <button
                        type="button"
                        class="block w-full text-left font-medium text-highlighted truncate hover:text-primary transition-colors"
                        :title="doc.Nombre"
                        @click="abrirDocumento(doc)"
                      >
                        {{ doc.Nombre }}
                      </button>
                      <div class="text-xs text-muted truncate">
                        {{ formatearTamano(doc.Tamano) }} · {{ formatearFechaHora(doc.CreatedAt) }}
                        <template v-if="doc.SubidoPor">
                          · {{ doc.SubidoPor }}
                        </template>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <UTooltip text="Ver documento">
                        <UButton
                          color="primary"
                          variant="ghost"
                          icon="i-mdi-eye-outline"
                          square
                          @click="abrirDocumento(doc)"
                        />
                      </UTooltip>
                      <UTooltip text="Descargar">
                        <UButton
                          color="neutral"
                          variant="ghost"
                          icon="i-mdi-download"
                          square
                          @click="descargarDocumento(doc)"
                        />
                      </UTooltip>
                      <UTooltip text="Eliminar">
                        <UButton
                          color="error"
                          variant="ghost"
                          icon="i-mdi-delete-outline"
                          square
                          @click="pedirBorrarDocumento(doc)"
                        />
                      </UTooltip>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ===== b) Operaciones ===== -->
            <div v-else-if="pestanaActiva === 'operaciones'" class="space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge color="primary" variant="subtle" icon="i-mdi-clock-outline">
                    {{ resumenOperaciones.pendientes }} pendiente(s)
                  </UBadge>
                  <UBadge
                    v-if="resumenOperaciones.vencidas"
                    color="warning"
                    variant="subtle"
                    icon="i-mdi-calendar-alert"
                  >
                    {{ resumenOperaciones.vencidas }} fuera de fecha
                  </UBadge>
                  <UBadge color="success" variant="subtle" icon="i-mdi-check-circle-outline">
                    {{ resumenOperaciones.completadas }} completada(s)
                  </UBadge>
                </div>

                <UButton
                  color="primary"
                  icon="i-mdi-plus"
                  label="Registrar operacion"
                  @click="abrirNuevaOperacion"
                />
              </div>

              <div
                v-if="!operaciones.length"
                class="rounded-lg border border-dashed border-default py-12 px-6 text-center"
              >
                <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                  <UIcon name="i-mdi-wrench-outline" class="size-7 text-primary" />
                </div>
                <p class="font-semibold text-highlighted mb-1">
                  Sin operaciones registradas
                </p>
                <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                  Aqui se llevan los mantenimientos, verificaciones y reparaciones
                  del vehiculo. Lo que registres tambien alimenta el desglose de gastos.
                </p>
                <UButton
                  color="primary"
                  icon="i-mdi-plus"
                  label="Registrar la primera operacion"
                  @click="abrirNuevaOperacion"
                />
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="operacion in operacionesOrdenadas"
                  :key="operacion.OperacionID"
                  class="rounded-lg border p-4"
                  :class="estaVencida(operacion)
                    ? 'border-warning/60 bg-warning/5'
                    : 'border-default'"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2 mb-1">
                        <UBadge color="neutral" variant="subtle" size="sm">
                          {{ operacion.Tipo }}
                        </UBadge>
                        <UBadge
                          :color="colorEstatusOperacion(operacion.Estatus)"
                          :icon="iconoEstatusOperacion(operacion.Estatus)"
                          variant="subtle"
                          size="sm"
                        >
                          {{ operacion.Estatus }}
                        </UBadge>
                        <UBadge
                          v-if="estaVencida(operacion)"
                          color="warning"
                          variant="solid"
                          size="sm"
                          icon="i-mdi-calendar-alert"
                        >
                          Fuera de fecha
                        </UBadge>
                      </div>

                      <p class="font-semibold text-highlighted">
                        {{ operacion.Accion }}
                      </p>
                      <p v-if="operacion.Notas" class="text-sm text-muted mt-1">
                        {{ operacion.Notas }}
                      </p>
                    </div>

                    <div class="text-right shrink-0">
                      <div class="text-lg font-bold text-highlighted tabular-nums">
                        {{ formatearMoneda(operacion.Precio) }}
                      </div>
                      <div class="text-xs text-muted">
                        {{ operacion.Estatus === 'Completada' ? 'Ejercido' : 'Estimado' }}
                      </div>
                    </div>
                  </div>

                  <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <div class="text-xs text-muted">
                        Fecha limite
                      </div>
                      <div
                        class="font-medium"
                        :class="estaVencida(operacion) ? 'text-warning' : 'text-highlighted'"
                      >
                        {{ formatearFechaCorta(operacion.FechaLimite) }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">
                        Proveedor
                      </div>
                      <div class="font-medium text-highlighted truncate">
                        {{ operacion.Proveedor || '—' }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">
                        Responsable
                      </div>
                      <div class="font-medium text-highlighted truncate">
                        {{ operacion.ResponsableNombre || '—' }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">
                        {{ operacion.FechaCompletada ? 'Completada el' : 'Registrada el' }}
                      </div>
                      <div class="font-medium text-highlighted">
                        {{ formatearFechaCorta(operacion.FechaCompletada || operacion.CreatedAt) }}
                      </div>
                    </div>
                  </div>

                  <!-- Documentos ligados a la operacion (facturas, ordenes). -->
                  <div
                    v-if="documentosPorOperacion.get(operacion.OperacionID)?.length"
                    class="mt-3 flex flex-wrap gap-2"
                  >
                    <UButton
                      v-for="doc in documentosPorOperacion.get(operacion.OperacionID)"
                      :key="doc.DocumentoID"
                      color="neutral"
                      variant="outline"
                      size="xs"
                      :icon="iconoDocumento(doc.MimeType)"
                      :label="doc.Nombre"
                      class="max-w-xs"
                      @click="abrirDocumento(doc)"
                    />
                  </div>

                  <div class="mt-3 pt-3 border-t border-default flex flex-wrap items-center gap-2">
                    <UButton
                      v-if="operacion.Estatus === 'Pendiente'"
                      color="success"
                      variant="subtle"
                      size="xs"
                      icon="i-mdi-check"
                      label="Marcar completada"
                      :loading="completandoId === operacion.OperacionID"
                      @click="completarOperacion(operacion)"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-mdi-paperclip"
                      label="Adjuntar factura"
                      :loading="subiendoDocumento && operacionParaFactura?.OperacionID === operacion.OperacionID"
                      @click="elegirFactura(operacion)"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-mdi-pencil-outline"
                      label="Editar"
                      @click="abrirEdicionOperacion(operacion)"
                    />
                    <UButton
                      color="error"
                      variant="ghost"
                      size="xs"
                      icon="i-mdi-delete-outline"
                      label="Eliminar"
                      @click="pedirBorrarOperacion(operacion)"
                    />
                  </div>
                </div>
              </div>

              <input
                ref="inputFactura"
                type="file"
                class="hidden"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                @change="alSeleccionarFactura"
              >
            </div>

            <!-- ===== c) Gastos ===== -->
            <div v-else-if="pestanaActiva === 'gastos'" class="space-y-6">
              <UAlert
                icon="i-mdi-information-outline"
                color="primary"
                variant="subtle"
                title="El gasto se calcula de las operaciones registradas"
                description="Cada importe proviene del precio capturado en una operacion del vehiculo. Las operaciones canceladas no suman, y las pendientes se cuentan como gasto comprometido."
              />

              <div
                v-if="!operacionesConGasto.length"
                class="rounded-lg border border-dashed border-default py-12 px-6 text-center"
              >
                <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                  <UIcon name="i-mdi-cash-multiple" class="size-7 text-primary" />
                </div>
                <p class="font-semibold text-highlighted mb-1">
                  Todavia no hay gastos
                </p>
                <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                  El desglose se arma solo en cuanto registres operaciones con un
                  precio capturado.
                </p>
                <UButton
                  color="primary"
                  variant="subtle"
                  icon="i-mdi-plus"
                  label="Registrar una operacion"
                  @click="pestanaActiva = 'operaciones'; abrirNuevaOperacion()"
                />
              </div>

              <template v-else>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div class="rounded-lg border border-default p-4">
                    <div class="text-xs uppercase tracking-wide text-muted mb-1">
                      Gasto total
                    </div>
                    <div class="text-2xl font-bold text-primary tabular-nums">
                      {{ formatearMoneda(totalGastos) }}
                    </div>
                    <div class="text-xs text-dimmed mt-0.5">
                      {{ operacionesConGasto.length }} operacion(es)
                    </div>
                  </div>

                  <div class="rounded-lg border border-default p-4">
                    <div class="text-xs uppercase tracking-wide text-muted mb-1">
                      Ejercido
                    </div>
                    <div class="text-2xl font-bold text-success tabular-nums">
                      {{ formatearMoneda(gastoEjercido) }}
                    </div>
                    <div class="text-xs text-dimmed mt-0.5">
                      Operaciones completadas
                    </div>
                  </div>

                  <div class="rounded-lg border border-default p-4">
                    <div class="text-xs uppercase tracking-wide text-muted mb-1">
                      Comprometido
                    </div>
                    <div class="text-2xl font-bold text-highlighted tabular-nums">
                      {{ formatearMoneda(gastoComprometido) }}
                    </div>
                    <div class="text-xs text-dimmed mt-0.5">
                      Operaciones pendientes
                    </div>
                  </div>
                </div>

                <!-- Subtotales por tipo. La barra usa ancho en `style` porque el
                     porcentaje es dinamico y no existe una clase para cada valor. -->
                <div>
                  <h3 class="font-semibold text-highlighted mb-3">
                    Gasto por tipo de operacion
                  </h3>
                  <div class="space-y-3">
                    <div v-for="(grupo, i) in gastosPorTipo" :key="grupo.tipo">
                      <div class="flex items-baseline justify-between gap-3 mb-1">
                        <span class="text-sm font-medium text-highlighted truncate">
                          {{ grupo.tipo }}
                          <span class="text-xs text-muted font-normal">({{ grupo.conteo }})</span>
                        </span>
                        <span class="text-sm font-semibold text-highlighted tabular-nums shrink-0">
                          {{ formatearMoneda(grupo.monto) }}
                          <span class="text-xs text-muted font-normal">
                            {{ Math.round(grupo.porcentaje) }}%
                          </span>
                        </span>
                      </div>
                      <div class="h-2 w-full rounded-full bg-elevated overflow-hidden">
                        <div
                          class="h-full rounded-full"
                          :style="{
                            width: `${Math.max(grupo.porcentaje, 1)}%`,
                            backgroundColor: colorCategoria(i)
                          }"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Detalle: la tabla se arma a mano porque cada fila mezcla
                     texto, badge e importe alineado a la derecha. -->
                <div>
                  <h3 class="font-semibold text-highlighted mb-3">
                    Detalle de gastos
                  </h3>
                  <div class="overflow-x-auto rounded-lg border border-default">
                    <table class="w-full text-sm">
                      <thead class="bg-elevated/40">
                        <tr class="text-left text-xs uppercase tracking-wide text-muted">
                          <th class="px-3 py-2 font-medium">
                            Fecha
                          </th>
                          <th class="px-3 py-2 font-medium">
                            Tipo
                          </th>
                          <th class="px-3 py-2 font-medium">
                            Accion
                          </th>
                          <th class="px-3 py-2 font-medium">
                            Proveedor
                          </th>
                          <th class="px-3 py-2 font-medium">
                            Estatus
                          </th>
                          <th class="px-3 py-2 font-medium text-right">
                            Importe
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-default">
                        <tr v-for="op in detalleGastos" :key="op.OperacionID">
                          <td class="px-3 py-2 whitespace-nowrap text-muted">
                            {{ formatearFechaCorta(op.FechaCompletada || op.FechaLimite || op.CreatedAt) }}
                          </td>
                          <td class="px-3 py-2 whitespace-nowrap">
                            {{ op.Tipo }}
                          </td>
                          <td class="px-3 py-2 max-w-xs truncate text-highlighted" :title="op.Accion">
                            {{ op.Accion }}
                          </td>
                          <td class="px-3 py-2 max-w-[12rem] truncate text-muted">
                            {{ op.Proveedor || '—' }}
                          </td>
                          <td class="px-3 py-2 whitespace-nowrap">
                            <UBadge
                              :color="colorEstatusOperacion(op.Estatus)"
                              variant="subtle"
                              size="sm"
                            >
                              {{ op.Estatus }}
                            </UBadge>
                          </td>
                          <td class="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                            {{ formatearMoneda(op.Precio) }}
                          </td>
                        </tr>
                      </tbody>
                      <tfoot class="bg-elevated/40 border-t border-default">
                        <tr>
                          <td colspan="5" class="px-3 py-2 text-right font-medium text-muted">
                            Total
                          </td>
                          <td class="px-3 py-2 text-right font-bold text-primary tabular-nums">
                            {{ formatearMoneda(totalGastos) }}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </template>
            </div>

            <!-- ===== d) Kilometraje ===== -->
            <div v-else-if="pestanaActiva === 'kilometraje'" class="space-y-6">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="rounded-lg border border-default p-4">
                  <div class="text-xs uppercase tracking-wide text-muted mb-1">
                    Kilometraje actual
                  </div>
                  <div class="text-2xl font-bold text-primary tabular-nums">
                    {{ kilometrajeActual != null ? `${formatearNumero(kilometrajeActual)} KM` : '—' }}
                  </div>
                  <div class="text-xs text-dimmed mt-0.5">
                    {{ ultimaLectura ? `Ultima lectura: ${formatearFechaCorta(ultimaLectura.Fecha)}` : 'Sin lecturas' }}
                  </div>
                </div>

                <div class="rounded-lg border border-default p-4">
                  <div class="text-xs uppercase tracking-wide text-muted mb-1">
                    Proximo servicio
                  </div>
                  <div class="text-2xl font-bold text-highlighted tabular-nums">
                    {{ vehiculo.KmProximoServicio ? `${formatearNumero(vehiculo.KmProximoServicio)} KM` : 'Sin programar' }}
                  </div>
                  <div
                    v-if="kmParaServicio !== null"
                    class="text-xs mt-0.5"
                    :class="{
                      'text-error': colorServicio === 'error',
                      'text-warning': colorServicio === 'warning',
                      'text-success': colorServicio === 'success'
                    }"
                  >
                    {{ kmParaServicio > 0
                      ? `Faltan ${formatearNumero(kmParaServicio)} KM`
                      : `Vencido por ${formatearNumero(Math.abs(kmParaServicio))} KM` }}
                  </div>
                </div>

                <div class="rounded-lg border border-default p-4">
                  <div class="text-xs uppercase tracking-wide text-muted mb-1">
                    Lecturas registradas
                  </div>
                  <div class="text-2xl font-bold text-highlighted tabular-nums">
                    {{ lecturas.length }}
                  </div>
                  <div class="text-xs text-dimmed mt-0.5">
                    Cada una con su comprobante
                  </div>
                </div>
              </div>

              <!-- Alta de lectura -->
              <div class="rounded-lg border border-default p-4">
                <h3 class="font-semibold text-highlighted mb-1">
                  Registrar lectura
                </h3>
                <p class="text-sm text-muted mb-4">
                  La lectura debe ser mayor o igual a la ultima registrada
                  <template v-if="ultimaLectura">
                    ({{ formatearNumero(ultimaLectura.Kilometraje) }} KM).
                  </template>
                  <template v-else>
                    .
                  </template>
                </p>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <UFormField
                    label="Kilometraje actual"
                    required
                    :error="erroresKilometraje.Kilometraje"
                  >
                    <UInput
                      v-model="formKilometraje.Kilometraje"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      icon="i-mdi-speedometer"
                      class="w-full"
                    >
                      <template #trailing>
                        <span class="text-xs text-muted font-medium">KM</span>
                      </template>
                    </UInput>
                  </UFormField>

                  <UFormField
                    label="Comprobante"
                    required
                    :error="erroresKilometraje.Comprobante"
                    help="Foto del tablero. Se reduce a 1200 px antes de enviarse."
                  >
                    <div class="flex items-center gap-3">
                      <UButton
                        color="neutral"
                        variant="outline"
                        icon="i-mdi-camera-outline"
                        :label="comprobante ? 'Cambiar foto' : 'Elegir foto'"
                        @click="elegirComprobante"
                      />
                      <template v-if="comprobante">
                        <img
                          :src="comprobante.vistaPrevia"
                          alt="Vista previa del comprobante"
                          class="size-12 rounded-lg object-cover border border-default"
                        >
                        <span class="text-xs text-muted">
                          {{ formatearTamano(comprobante.tamano) }}
                        </span>
                        <UButton
                          color="error"
                          variant="ghost"
                          size="xs"
                          icon="i-mdi-close"
                          square
                          @click="quitarComprobante"
                        />
                      </template>
                    </div>
                    <input
                      ref="inputComprobante"
                      type="file"
                      class="hidden"
                      accept="image/*"
                      capture="environment"
                      @change="alSeleccionarComprobante"
                    >
                  </UFormField>

                  <UFormField label="Notas" class="md:col-span-2">
                    <UTextarea
                      v-model="formKilometraje.Notas"
                      :rows="2"
                      placeholder="Observaciones de la lectura"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <div class="mt-4 flex justify-end">
                  <UButton
                    color="primary"
                    icon="i-mdi-content-save"
                    label="Registrar lectura"
                    :loading="guardandoLectura"
                    @click="registrarLectura"
                  />
                </div>
              </div>

              <!-- Historial -->
              <div>
                <h3 class="font-semibold text-highlighted mb-3">
                  Historial de lecturas
                </h3>

                <div
                  v-if="!lecturas.length"
                  class="rounded-lg border border-dashed border-default py-12 px-6 text-center"
                >
                  <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                    <UIcon name="i-mdi-speedometer" class="size-7 text-primary" />
                  </div>
                  <p class="font-semibold text-highlighted mb-1">
                    Sin lecturas registradas
                  </p>
                  <p class="text-sm text-muted max-w-sm mx-auto">
                    Captura la primera lectura con la foto del tablero. A partir de
                    la segunda se calculan los kilometros recorridos entre capturas.
                  </p>
                </div>

                <div v-else class="divide-y divide-default rounded-lg border border-default">
                  <div
                    v-for="lectura in lecturasOrdenadas"
                    :key="lectura.LecturaID"
                    class="flex flex-wrap items-center gap-3 p-3"
                  >
                    <div class="flex items-center justify-center size-10 rounded-full bg-primary/10 shrink-0">
                      <UIcon name="i-mdi-gauge" class="size-5 text-primary" />
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-baseline gap-2">
                        <span class="font-semibold text-highlighted tabular-nums">
                          {{ formatearNumero(lectura.Kilometraje) }} KM
                        </span>
                        <UBadge
                          v-if="lectura.recorrido !== null"
                          color="neutral"
                          variant="subtle"
                          size="sm"
                        >
                          +{{ formatearNumero(lectura.recorrido) }} KM recorridos
                        </UBadge>
                      </div>
                      <div class="text-xs text-muted truncate">
                        {{ formatearFechaHora(lectura.Fecha) }}
                        <template v-if="lectura.CapturadoPorNombre">
                          · {{ lectura.CapturadoPorNombre }}
                        </template>
                      </div>
                      <p v-if="lectura.Notas" class="text-xs text-muted mt-0.5">
                        {{ lectura.Notas }}
                      </p>
                    </div>

                    <UButton
                      v-if="lectura.DocumentoID != null"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-mdi-image-outline"
                      label="Ver comprobante"
                      class="shrink-0"
                      @click="abrirDocumento(documentoDeLectura(lectura))"
                    />
                    <span v-else class="text-xs text-dimmed shrink-0">Sin comprobante</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </template>

      <!-- ===== Visor de documentos ===== -->
      <!-- Un solo modal sirve para todos los adjuntos de la pagina: la poliza,
           las facturas de las operaciones y los comprobantes de kilometraje. -->
      <UModal
        v-model:open="visorAbierto"
        :title="visorDocumento?.Nombre || 'Documento'"
        :ui="{ content: 'max-w-5xl', body: 'p-0 sm:p-0' }"
      >
        <template #body>
          <div class="min-h-[60vh] flex items-center justify-center bg-elevated/30">
            <div v-if="visorCargando" class="w-full p-6">
              <USkeleton class="h-[55vh] w-full rounded-lg" />
            </div>

            <div v-else-if="visorError" class="p-10 text-center">
              <UIcon name="i-mdi-file-alert-outline" class="size-12 text-error mb-3" />
              <p class="font-semibold text-highlighted mb-1">
                No se pudo abrir el documento
              </p>
              <p class="text-sm text-muted">
                {{ visorError }}
              </p>
            </div>

            <!-- Imagen: se muestra completa dentro del modal, sin recortes. -->
            <img
              v-else-if="esImagen(visorDocumento?.MimeType)"
              :src="visorDataUri"
              :alt="visorDocumento?.Nombre"
              class="max-h-[75vh] max-w-full object-contain"
            >

            <!-- PDF: el visor nativo del navegador dentro de un iframe que
                 apunta al data URI. Evita depender de una libreria y funciona
                 con el mismo contenido base64 que ya se descargo. -->
            <iframe
              v-else-if="esPdf(visorDocumento?.MimeType)"
              :src="visorDataUri"
              :title="visorDocumento?.Nombre"
              class="w-full border-0"
              style="height: 75vh"
            />

            <!-- Cualquier otro formato no se puede previsualizar; queda la
                 descarga como salida. -->
            <div v-else class="p-10 text-center">
              <UIcon name="i-mdi-file-outline" class="size-12 text-muted mb-3" />
              <p class="font-semibold text-highlighted mb-1">
                Vista previa no disponible
              </p>
              <p class="text-sm text-muted mb-4">
                Este formato no se puede mostrar en el navegador. Descargalo para verlo.
              </p>
              <UButton
                color="primary"
                icon="i-mdi-download"
                label="Descargar"
                @click="descargarDocumento(visorDocumento, visorDataUri)"
              />
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex flex-wrap items-center justify-between gap-2 w-full">
            <span class="text-xs text-muted truncate">
              {{ visorDocumento?.MimeType }}
              <template v-if="visorDocumento?.Tamano">
                · {{ formatearTamano(visorDocumento.Tamano) }}
              </template>
            </span>

            <div class="flex items-center gap-2">
              <UButton
                v-if="visorDocumento?.DocumentoID"
                color="error"
                variant="ghost"
                icon="i-mdi-delete-outline"
                label="Eliminar"
                @click="pedirBorrarDocumento(visorDocumento)"
              />
              <UButton
                color="neutral"
                variant="outline"
                icon="i-mdi-download"
                label="Descargar"
                :disabled="!visorDataUri"
                @click="descargarDocumento(visorDocumento, visorDataUri)"
              />
              <UButton color="primary" label="Cerrar" @click="visorAbierto = false" />
            </div>
          </div>
        </template>
      </UModal>

      <!-- ===== Alta y edicion de operacion ===== -->
      <UModal
        v-model:open="modalOperacion"
        :title="operacionEditada ? 'Editar operacion' : 'Registrar operacion'"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Tipo" required :error="erroresOperacion.Tipo">
              <USelect
                v-model="formOperacion.Tipo"
                :items="opcionesTipo"
                placeholder="Selecciona el tipo"
                icon="i-mdi-shape-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Accion" required :error="erroresOperacion.Accion">
              <UInput
                v-model="formOperacion.Accion"
                placeholder="Resume la accion a tomar"
                icon="i-mdi-format-list-checks"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Precio">
              <UInput
                v-model="formOperacion.Precio"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="w-full"
              >
                <template #leading>
                  <span class="text-sm text-muted font-medium">$</span>
                </template>
              </UInput>
            </UFormField>

            <UFormField label="Accion Finaliza" required :error="erroresOperacion.FechaLimite">
              <UInput
                v-model="formOperacion.FechaLimite"
                type="date"
                icon="i-mdi-calendar-check-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Notas">
              <UTextarea
                v-model="formOperacion.Notas"
                :rows="3"
                placeholder="Detalle de la accion"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Proveedor">
              <UInput
                v-model="formOperacion.Proveedor"
                placeholder="Taller, agencia o prestador del servicio"
                icon="i-mdi-store-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Responsable interno"
              required
              :error="erroresOperacion.ResponsableUserID"
            >
              <USelectMenu
                v-model="formOperacion.ResponsableUserID"
                :items="opcionesResponsable"
                value-key="value"
                placeholder="Selecciona un responsable"
                :search-input="{ placeholder: 'Buscar persona...' }"
                icon="i-mdi-account-search-outline"
                class="w-full"
              >
                <template #empty>
                  <p class="text-sm text-muted p-2">
                    No hay usuarios disponibles.
                  </p>
                </template>
              </USelectMenu>
            </UFormField>

            <!-- El estatus sólo se edita sobre una operacion existente: al
                 crearla siempre nace pendiente. -->
            <UFormField v-if="operacionEditada" label="Estatus">
              <USelect
                v-model="formOperacion.Estatus"
                :items="['Pendiente', 'Completada', 'Cancelada']"
                icon="i-mdi-flag-outline"
                class="w-full"
              />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="modalOperacion = false">
              Cancelar
            </UButton>
            <UButton color="primary" :loading="guardandoOperacion" @click="guardarOperacion">
              {{ operacionEditada ? 'Guardar cambios' : 'Registrar' }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- ===== Edicion de la ficha del vehiculo ===== -->
      <UModal v-model:open="modalEditar" title="Editar vehiculo">
        <template #body>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Nombre" class="sm:col-span-2">
              <UInput v-model="formVehiculo.Nombre" class="w-full" />
            </UFormField>

            <UFormField label="Placas">
              <UInput v-model="formVehiculo.Placas" class="w-full" />
            </UFormField>

            <UFormField label="Estatus">
              <USelect
                v-model="formVehiculo.Estatus"
                :items="opcionesEstatusVehiculo"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Marca">
              <UInput v-model="formVehiculo.Marca" class="w-full" />
            </UFormField>

            <UFormField label="Modelo">
              <UInput v-model="formVehiculo.Modelo" class="w-full" />
            </UFormField>

            <UFormField label="Serie">
              <UInput v-model="formVehiculo.Serie" class="w-full" />
            </UFormField>

            <UFormField label="Color">
              <UInput v-model="formVehiculo.Color" class="w-full" />
            </UFormField>

            <UFormField label="Aseguradora">
              <UInput v-model="formVehiculo.Aseguradora" class="w-full" />
            </UFormField>

            <UFormField label="Numero de poliza">
              <UInput v-model="formVehiculo.NumeroPoliza" class="w-full" />
            </UFormField>

            <UFormField label="Vigencia del seguro">
              <UInput v-model="formVehiculo.VigenciaSeguro" type="date" class="w-full" />
            </UFormField>

            <UFormField label="Vigencia de verificacion">
              <UInput v-model="formVehiculo.VigenciaVerificacion" type="date" class="w-full" />
            </UFormField>

            <UFormField label="Vigencia de tenencia">
              <UInput v-model="formVehiculo.VigenciaTenencia" type="date" class="w-full" />
            </UFormField>

            <UFormField label="Km del proximo servicio">
              <UInput
                v-model="formVehiculo.KmProximoServicio"
                type="number"
                min="0"
                step="1"
                class="w-full"
              >
                <template #trailing>
                  <span class="text-xs text-muted font-medium">KM</span>
                </template>
              </UInput>
            </UFormField>

            <UFormField label="Responsable" help="Quien tiene asignado el vehiculo." class="sm:col-span-1">
              <USelectMenu
                v-model="formVehiculo.ResponsableUserID"
                :items="opcionesResponsable"
                value-key="value"
                placeholder="Sin asignar"
                :search-input="{ placeholder: 'Buscar persona...' }"
                icon="i-mdi-account-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Encargado de flotilla" help="Quien da seguimiento a vigencias y servicios." class="sm:col-span-1">
              <USelectMenu
                v-model="formVehiculo.EncargadoUserID"
                :items="opcionesResponsable"
                value-key="value"
                placeholder="Sin asignar"
                :search-input="{ placeholder: 'Buscar persona...' }"
                icon="i-mdi-account-hard-hat-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Foto" :error="errorFotoVehiculo" class="sm:col-span-2">
              <div class="flex items-center gap-3">
                <div class="foto-plato size-20 shrink-0 rounded-lg border border-default flex items-center justify-center overflow-hidden p-1.5">
                  <img
                    v-if="formVehiculo.Foto"
                    :src="formVehiculo.Foto"
                    alt="Vista previa"
                    class="max-h-full max-w-full object-contain mix-blend-multiply"
                  >
                  <UIcon v-else name="i-mdi-car-outline" class="size-8 text-ink-400" />
                </div>
                <div class="flex flex-wrap gap-2">
                  <input
                    ref="entradaFotoVehiculo"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="seleccionarFotoVehiculo"
                  >
                  <UButton
                    :label="formVehiculo.Foto ? 'Cambiar foto' : 'Elegir foto'"
                    icon="i-mdi-image-outline"
                    color="neutral"
                    variant="subtle"
                    @click="entradaFotoVehiculo?.click()"
                  />
                  <UButton
                    v-if="formVehiculo.Foto"
                    label="Quitar"
                    icon="i-mdi-close"
                    color="neutral"
                    variant="ghost"
                    @click="formVehiculo.Foto = null"
                  />
                </div>
              </div>
            </UFormField>

            <UFormField label="Notas" class="sm:col-span-2">
              <UTextarea v-model="formVehiculo.Notas" :rows="3" class="w-full" />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="modalEditar = false">
              Cancelar
            </UButton>
            <UButton color="primary" :loading="guardandoVehiculo" @click="guardarVehiculo">
              Guardar cambios
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- ===== Confirmaciones ===== -->
      <UModal
        v-model:open="confirmarBorrarDoc"
        title="Eliminar documento"
        :description="`El documento ${documentoABorrar?.Nombre || ''} se borrara de forma permanente.`"
      >
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="confirmarBorrarDoc = false">
              Cancelar
            </UButton>
            <UButton color="error" :loading="borrandoDocumento" @click="borrarDocumento">
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="confirmarBorrarOp"
        title="Eliminar operacion"
        description="La operacion y su importe dejaran de contar en el desglose de gastos."
      >
        <template #body>
          <div class="space-y-3">
            <p class="text-muted">
              Se eliminara
              <b class="text-highlighted">{{ operacionABorrar?.Accion }}</b>
              por {{ formatearMoneda(operacionABorrar?.Precio) }}.
            </p>
            <UAlert
              v-if="documentosPorOperacion.get(operacionABorrar?.OperacionID)?.length"
              icon="i-mdi-alert-outline"
              color="warning"
              variant="subtle"
              title="Tiene documentos adjuntos"
              description="Los archivos ligados a esta operacion tambien podrian eliminarse."
            />
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="confirmarBorrarOp = false">
              Cancelar
            </UButton>
            <UButton color="error" :loading="borrandoOperacion" @click="borrarOperacion">
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
