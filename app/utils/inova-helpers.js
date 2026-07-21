// Helpers de dominio del módulo InovaOS (portados fielmente de la PWA: src/js/pendientes.js).

export const ETIQUETAS = {
  capturado: 'Capturado',
  delegado: 'Delegado',
  aceptado: 'Aceptado',
  en_progreso: 'En progreso',
  en_espera: 'En espera',
  concluido: 'Concluido',
  aprobado: 'Aprobado',
  reagendado: 'Reagendado'
}
export const etiquetaEstatus = e => ETIQUETAS[e] || e

export const CERRADOS = ['concluido', 'aprobado']

// Áreas fijas para la captura (idénticas a la PWA).
export const AREAS = [
  'Finanzas', 'Cobranza', 'Cotizaciones', 'Seguimiento a cotizaciones',
  'Operación', 'Proyectos', 'Gestión', 'Administración'
]

// Pilas (categorías) debajo de Todas / Para mí / Yo delegué.
export const CATEGORIAS = [
  { key: 'inmediata', label: 'Atención inmediata' },
  { key: 'vencidos', label: 'Vencidos' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'proximos', label: 'Próximos 7 días' },
  { key: 'espera', label: 'En espera' },
  { key: 'sinfecha', label: 'Sin fecha' },
  { key: 'concluidos', label: 'Concluidos' },
  { key: 'archivados', label: 'Archivados' }
]

// Semáforo del Inicio y Tablero (colores idénticos a la PWA).
export const ST_HEX = {
  vencido: '#ff453a',
  hoy: '#ff9f0a',
  manana: '#ffd60a',
  tiempo: '#30d158',
  concluido: '#0a84ff',
  espera: '#bf5af2'
}
export const SEMAFORO_HOME = [
  { key: 'vencido', label: 'Vencidos' },
  { key: 'hoy', label: 'Vencen hoy' },
  { key: 'manana', label: 'Vencen mañana' },
  { key: 'tiempo', label: 'En tiempo' },
  { key: 'concluido', label: 'Concluidos' },
  { key: 'espera', label: 'En espera' }
]
export const SEMAFORO_TABLERO = [
  { key: 'vencido', label: 'Vencidos' },
  { key: 'hoy', label: 'Vencen hoy' },
  { key: 'manana', label: 'Vencen mañana' },
  { key: 'tiempo', label: 'En tiempo' },
  { key: 'concluido', label: 'Concluidos' },
  { key: 'espera', label: 'Esperando respuesta' }
]
// Al tocar una tarjeta del semáforo, la lista se abre en esta pila.
export const MAPA_FILTRO = {
  vencido: 'vencidos',
  hoy: 'hoy',
  manana: 'proximos',
  tiempo: 'proximos',
  concluido: 'concluidos',
  espera: 'espera'
}

export function diasRestantes(fecha) {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const f = new Date(String(fecha).slice(0, 10) + 'T12:00:00')
  f.setHours(0, 0, 0, 0)
  return Math.round((f - hoy) / 86400000)
}

// Color de semáforo (key) de un pendiente.
export function estatusColor(p) {
  if (CERRADOS.includes(p.estatus)) return 'concluido'
  if (p.estatus === 'en_espera') return 'espera'
  const d = diasRestantes(p.fecha_compromiso)
  if (d === null) return 'tiempo'
  if (d < 0) return 'vencido'
  if (d === 0) return 'hoy'
  if (d === 1) return 'manana'
  return 'tiempo'
}
export const colorPrioridad = p => ({ Alta: '#ff453a', Media: '#ff9f0a', Baja: '#30d158' }[p] || '#8a8699')

export function formatFecha(fecha) {
  const d = diasRestantes(fecha)
  if (d === null) return '—'
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d === -1) return 'hace 1 día'
  if (d < 0) return `hace ${-d} días`
  return `en ${d} días`
}
export const fdate = iso =>
  iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fdatetime = iso =>
  iso ? new Date(String(iso).replace(' ', 'T') + 'Z').toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Monterrey' }) : ''

/* ------------------------- Permisos / relación ------------------------- */
export const esCreador = (p, myId) => myId != null && Number(p.creado_por) === Number(myId)
export const esResponsable = (p, myId) => myId != null && Number(p.responsable_id) === Number(myId)
export const esPersonal = (p, myId) => esCreador(p, myId) && esResponsable(p, myId)
export const puedeEditar = (p, myId) => esCreador(p, myId) && p.estatus !== 'aprobado'
export const puedeEliminar = (p, myId) => esCreador(p, myId)

export function relacionCon(p, myId) {
  const mia = esResponsable(p, myId)
  const delegada = esCreador(p, myId)
  if (mia && delegada) return 'ambas'
  if (mia) return 'mia'
  if (delegada) return 'delegada'
  return null
}
export function etiquetaRelacion(p, myId) {
  const r = relacionCon(p, myId)
  if (r === 'ambas') return 'Mío'
  if (r === 'mia') return 'Para mí'
  if (r === 'delegada') return 'Delegué'
  return ''
}

/* ------------------------- Flujo de acciones ------------------------- */
// Acciones disponibles para el usuario en el estatus actual (fiel a la PWA).
export function accionesDisponibles(p, myId) {
  if (!p) return []
  const acciones = []
  const comoResp = esResponsable(p, myId)
  const comoCre = esCreador(p, myId)

  if (esPersonal(p, myId)) {
    if (!CERRADOS.includes(p.estatus)) {
      acciones.push({ id: 'completar', texto: 'Completar', tipo: 'estatus', estatus: 'aprobado', color: 'success', fill: true })
      acciones.push({ id: 'editar', texto: 'Editar', tipo: 'editar' })
    }
    return acciones
  }

  switch (p.estatus) {
    case 'capturado':
      if (comoCre) acciones.push({ id: 'editar', texto: 'Asignar responsable', tipo: 'editar', fill: true })
      break
    case 'delegado':
    case 'reagendado':
      if (comoResp) {
        acciones.push({ id: 'aceptar', texto: 'Aceptar', tipo: 'estatus', estatus: 'aceptado', fill: true })
        acciones.push({ id: 'reagendar', texto: 'Reagendar', tipo: 'reagendar' })
      }
      break
    case 'aceptado':
      if (comoResp) acciones.push({ id: 'iniciar', texto: 'Iniciar', tipo: 'estatus', estatus: 'en_progreso', fill: true })
      break
    case 'en_progreso':
      if (comoResp) {
        acciones.push({ id: 'concluir', texto: 'Marcar como concluido', tipo: 'estatus', estatus: 'concluido', fill: true })
        acciones.push({ id: 'espera', texto: 'Poner en espera', tipo: 'estatus', estatus: 'en_espera' })
      }
      break
    case 'en_espera':
      if (comoResp) acciones.push({ id: 'retomar', texto: 'Retomar', tipo: 'estatus', estatus: 'en_progreso', fill: true })
      break
    case 'concluido':
      if (comoCre) {
        acciones.push({ id: 'aprobar', texto: 'Aprobar', tipo: 'estatus', estatus: 'aprobado', color: 'success', fill: true })
        acciones.push({ id: 'devolver', texto: 'Devolver a revisión', tipo: 'estatus', estatus: 'en_progreso', color: 'error' })
      }
      break
    default: break
  }
  return acciones
}

export function motivoSinAcciones(p) {
  if (!p) return ''
  if (p.estatus === 'aprobado') return 'Este pendiente está cerrado y aprobado.'
  if (p.estatus === 'concluido') return 'Esperando la revisión de quien lo delegó.'
  if (['delegado', 'reagendado', 'aceptado', 'en_progreso', 'en_espera'].includes(p.estatus)) {
    return `Esperando a ${p.responsable_nombre || 'el responsable'}.`
  }
  return ''
}

/* ------------------------- Pilas (categorías) ------------------------- */
export function enCategoria(p, key, myId) {
  const cerrado = CERRADOS.includes(p.estatus)
  const enEspera = p.estatus === 'en_espera'
  const activo = !cerrado && !enEspera
  const d = diasRestantes(p.fecha_compromiso)
  const vencido = d !== null && d < 0
  const esHoy = d === 0
  const prox7 = d !== null && d >= 1 && d <= 7
  const alta = String(p.prioridad || '').toLowerCase() === 'alta'
  const esperaMiAceptacion = myId != null && Number(p.responsable_id) === Number(myId) && ['delegado', 'reagendado'].includes(p.estatus)
  switch (key) {
    case 'inmediata': return activo && (vencido || esHoy || (alta && d !== null && d <= 2) || esperaMiAceptacion)
    case 'vencidos': return activo && vencido
    case 'hoy': return activo && esHoy
    case 'proximos': return activo && prox7
    case 'espera': return enEspera
    case 'sinfecha': return activo && d === null
    case 'concluidos': return cerrado
    default: return false
  }
}

export const msgError = err => err?.response?.data?.error || err?.response?.data?.msg || 'Ocurrió un error'
