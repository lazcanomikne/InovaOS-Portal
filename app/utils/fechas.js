// Formato de fechas del portal.
//
// El problema que resuelven estas funciones: SQL Server devuelve las columnas
// `DATE` como medianoche UTC ("2019-12-02T00:00:00.000Z"). Si eso se pasa a
// `new Date()` y se formatea, el navegador lo convierte a la hora local y en
// México (UTC-6) retrocede al 1 de diciembre. La fecha se muestra un día antes
// de la que está guardada.
//
// La distinción es entre dos tipos de dato, no entre dos formatos:
//
//   DATE      una fecha de calendario sin hora: ingreso, inicio y fin de
//             vacaciones, vigencias. No tiene zona horaria, así que se toma
//             tal cual viene y se arma en hora local.
//
//   DATETIME  un instante: creación de un registro, captura de una solicitud.
//             Ahí la conversión a hora local sí es la correcta.

/** Fecha de calendario (columna DATE) en hora local, sin corrimiento. */
export const aFechaLocal = (valor) => {
  if (!valor) return null
  // Se toma sólo la parte YYYY-MM-DD y se arma con el constructor de partes,
  // que interpreta en hora local en vez de UTC.
  const texto = String(valor).slice(0, 10)
  const [anio, mes, dia] = texto.split('-').map(Number)
  if (!anio || !mes || !dia) return null
  const f = new Date(anio, mes - 1, dia)
  return Number.isNaN(f.getTime()) ? null : f
}

/** Instante (columna DATETIME). Aquí sí se convierte a la zona del usuario. */
export const aInstante = (valor) => {
  if (!valor) return null
  const f = new Date(valor)
  return Number.isNaN(f.getTime()) ? null : f
}

const VACIO = '—'

/** "02 dic 2019" */
export const fechaCorta = (valor, respaldo = VACIO) => {
  const f = aFechaLocal(valor)
  return f ? f.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : respaldo
}

/** "2 de diciembre de 2019" */
export const fechaLarga = (valor, respaldo = VACIO) => {
  const f = aFechaLocal(valor)
  return f ? f.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : respaldo
}

/** "02/12/2019" */
export const fechaNumerica = (valor, respaldo = VACIO) => {
  const f = aFechaLocal(valor)
  return f ? f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : respaldo
}

/** "02 dic 2019, 4:16 p.m." — para columnas DATETIME. */
export const fechaHora = (valor, respaldo = VACIO) => {
  const f = aInstante(valor)
  if (!f) return respaldo
  return f.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    + ', ' + f.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** Valor para un <input type="date">, que siempre espera YYYY-MM-DD. */
export const aValorInput = valor => (valor ? String(valor).slice(0, 10) : '')

/** Días transcurridos desde una fecha de calendario hasta hoy. */
export const diasDesde = (valor) => {
  const f = aFechaLocal(valor)
  if (!f) return null
  const hoy = new Date()
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((h - f) / 86400000)
}

/** Días de hoy hasta una fecha de calendario. Negativo si ya pasó. */
export const diasPara = (valor) => {
  const d = diasDesde(valor)
  return d === null ? null : -d
}
