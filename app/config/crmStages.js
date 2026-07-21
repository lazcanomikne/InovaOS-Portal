// Etapas compartidas entre cotizaciones y oportunidades.
// Mantener sincronizado con CrmPipelineControl.Etapa y CrmOpportunities.Etapa en backend.
export const stageOptions = [
  '1. Dimensionamiento',
  '2. Negociación',
  '3. Aprobado/OC',
  '4. Colocado',
  '5. Perdida',
  '6. Sin presupuesto'
]

export const stageColors = {
  '1. Dimensionamiento': 'info',
  '2. Negociación': 'warning',
  '3. Aprobado/OC': 'primary',
  '4. Colocado': 'success',
  '5. Perdida': 'error',
  // 'grey' no existe en Nuxt UI; su equivalente es 'neutral'
  '6. Sin presupuesto': 'neutral'
}

export const ETAPA_PERDIDA = '5. Perdida'

// Motivos cuando se selecciona Perdida
export const motivoPerdidaOptions = [
  'Perdí contra competidor',
  'Perdí por presupuesto',
  'Se Pospuso',
  'Otro'
]

export const isPerdida = etapa => etapa === ETAPA_PERDIDA
export const requiresSeguimiento = motivo => motivo === 'Se Pospuso'
export const requiresComentario = motivo => motivo === 'Otro'
