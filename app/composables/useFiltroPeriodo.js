// Filtro de periodo compartido (año + meses), con el mismo comportamiento en
// todos los módulos que listan movimientos históricos.
//
// Por qué existe: varios endpoints devuelven el histórico completo (miles de
// filas). El API responde rápido, pero pintar todo de golpe traba la vista.
// Acotar el periodo por omisión al mes en curso resuelve el problema sin
// esconder el histórico: basta con quitar el mes para ver el año completo, o
// marcar "Todo el histórico".
//
// Uso:
//   const { periodo, MESES, aniosDisponibles, enPeriodo, periodoEsPredeterminado,
//           limpiarPeriodo, etiquetaMes } = useFiltroPeriodo(items, 'fecha')

export const MESES_PERIODO = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' }
]

export function useFiltroPeriodo(items, campoFecha = 'fecha') {
  const ahora = new Date()
  const anioActual = String(ahora.getFullYear())
  const mesActual = String(ahora.getMonth() + 1)

  // Arranca en el año y mes en curso.
  const periodo = ref({
    anio: anioActual,
    meses: [mesActual],
    historico: false
  })

  // Sólo se ofrecen los años presentes en los datos, para no mostrar periodos
  // vacíos. El año en curso siempre está disponible aunque aún no tenga datos.
  const aniosDisponibles = computed(() => {
    const set = new Set(
      (unref(items) || [])
        .map(o => new Date(o[campoFecha]))
        .filter(f => !isNaN(f))
        .map(f => String(f.getFullYear()))
    )
    set.add(anioActual)
    return [...set].sort((a, b) => Number(b) - Number(a))
  })

  const enPeriodo = (registro) => {
    if (periodo.value.historico) return true
    const f = new Date(registro[campoFecha])
    if (isNaN(f)) return false
    if (String(f.getFullYear()) !== periodo.value.anio) return false
    // Sin meses seleccionados = año completo.
    if (!periodo.value.meses.length) return true
    return periodo.value.meses.includes(String(f.getMonth() + 1))
  }

  // El periodo por omisión no cuenta como "filtro activo": es el estado normal
  // de la pantalla, no algo que el usuario haya elegido.
  const periodoEsPredeterminado = computed(() =>
    !periodo.value.historico
    && periodo.value.anio === anioActual
    && periodo.value.meses.length === 1
    && periodo.value.meses[0] === mesActual
  )

  const limpiarPeriodo = () => {
    periodo.value = { anio: anioActual, meses: [mesActual], historico: false }
  }

  const etiquetaMes = valor => MESES_PERIODO.find(m => m.value === valor)?.label || valor

  return {
    periodo,
    MESES: MESES_PERIODO,
    aniosDisponibles,
    enPeriodo,
    periodoEsPredeterminado,
    limpiarPeriodo,
    etiquetaMes
  }
}
