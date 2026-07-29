<script setup>
import { ref, computed, watch } from 'vue'
import axios from '~/utils/axios'
import { useCompanyStore } from '~/stores/company'

const props = defineProps({
  modelValue: Boolean,
  folio: [Number, String],
  docEntry: [Number, String],
  header: Object // pre-cargado desde el listado (SourceCompany, margen, utilidad…)
})
const emit = defineEmits(['update:modelValue'])

// Logo de la EMPRESA de la factura (su SourceCompany), no uno fijo. El papel
// (color surface) cambia con el modo: oscuro usa el logo claro; claro usa el
// printLogo (visible sobre blanco).
const colorMode = useColorMode()
const companyStore = useCompanyStore()
const isDark = computed(() => colorMode.value === 'dark')
const empresaFactura = computed(() =>
  companyStore.companies.find(c => c.id === props.header?.SourceCompany) || companyStore.company
)
const activeLogo = computed(() => {
  const c = empresaFactura.value
  if (!c) return null
  return isDark.value ? (c.logoDark || c.logo) : (c.printLogo || c.logo)
})

const internalModel = ref(props.modelValue)
const loading = ref(false)
const detalle = ref({ header: null, lines: [] })

// Actividades
const logs = ref([])
const newLogText = ref('')
const getToday = () => new Date().toISOString().split('T')[0]
const followUpDate = ref(getToday())
const savingLog = ref(false)
const m365Connected = ref(false)
const m365Error = ref(false)

const sourceParams = computed(() => props.header?.SourceCompany ? { sourceCompany: props.header.SourceCompany } : {})

watch(() => props.modelValue, (val) => {
  internalModel.value = val
  if (val && props.docEntry) {
    fetchData()
    checkM365Status()
  }
})
watch(internalModel, (val) => { emit('update:modelValue', val) })

const fetchData = async () => {
  loading.value = true
  try {
    const [resDet, resLogs] = await Promise.all([
      axios.get(`/crm/invoices/${props.docEntry}`, { params: sourceParams.value }),
      axios.get(`/crm/invoice-logs/${props.folio}`, { params: sourceParams.value })
    ])
    detalle.value = resDet.data || { header: null, lines: [] }
    logs.value = resLogs.data || []
  } catch (error) {
    console.error('Error cargando detalle de factura:', error)
  } finally {
    loading.value = false
  }
}

const fetchLogs = async () => {
  try {
    const res = await axios.get(`/crm/invoice-logs/${props.folio}`, { params: sourceParams.value })
    logs.value = res.data || []
  } catch (err) { console.error(err) }
}

const saveLog = async () => {
  if (!newLogText.value) return
  savingLog.value = true
  try {
    const response = await axios.post('/crm/invoice-logs', {
      Folio: props.folio,
      DocEntry: props.docEntry,
      SourceCompany: props.header?.SourceCompany,
      Text: newLogText.value,
      Type: 'comment',
      FollowUpDate: followUpDate.value,
      CardName: detalle.value?.header?.Cliente || props.header?.Cliente
    })
    if (response.data.m365Error) {
      m365Error.value = true
      if (response.data.m365Error === 'InvalidAuthenticationToken' || String(response.data.m365Error).includes('401')) {
        m365Connected.value = false
      }
    }
    newLogText.value = ''
    followUpDate.value = getToday()
    fetchLogs()
  } catch (error) {
    console.error('Error guardando actividad:', error)
  } finally {
    savingLog.value = false
  }
}

// --- Microsoft To Do (igual que el Pipeline) ---
const checkM365Status = async () => {
  try {
    const res = await axios.get('/m365/status')
    m365Connected.value = res.data.connected
  } catch (err) { console.error('Error M365 status:', err) }
}
const connectM365 = () => {
  m365Error.value = false
  const token = localStorage.getItem('token')
  let uid = ''
  if (token) {
    try { uid = JSON.parse(atob(token.split('.')[1])).uid } catch (e) { console.error(e) }
  }
  if (!uid) { alert('Debes estar logueado para conectar Microsoft'); return }
  const width = 600, height = 700
  const left = window.screen.width / 2 - width / 2
  const top = window.screen.height / 2 - height / 2
  const handleMessage = (event) => {
    if (event.data.type === 'm365_connected') {
      m365Connected.value = true
      window.removeEventListener('message', handleMessage)
    }
  }
  window.addEventListener('message', handleMessage)
  window.open(`${axios.defaults.baseURL}/m365/login?uid=${uid}`, 'M365Auth', `width=${width},height=${height},left=${left},top=${top}`)
}

const close = () => { internalModel.value = false }

// --- Formatters ---
const formatCurrency = (value, currency) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency || 'MXN' }).format(value || 0)
const formatPercent = (value) =>
  new Intl.NumberFormat('es-MX', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((value || 0) / 100)
// Fecha de calendario (DATE) sin corrimiento por UTC.
const fmtFecha = (v) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-').map(Number)
  if (!a) return '—'
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
}
// Instante (DATETIME): el log y su recordatorio.
const fmtFechaHora = (v) => v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : ''

const cab = computed(() => detalle.value?.header || props.header || {})
const getMarginColor = (m) => (m > 20 ? 'success' : m < 10 ? 'error' : 'warning')
const marginTextClass = m => ({ success: 'text-success', error: 'text-error', warning: 'text-warning' }[getMarginColor(m)])
const getPaymentStatusColor = (status) => ({ Pagada: 'success', Parcial: 'warning', Pendiente: 'error' }[status] || 'neutral')
</script>

<template>
  <UModal v-model:open="internalModel" fullscreen :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-2 w-full">
        <UButton icon="i-mdi-close" color="neutral" variant="ghost" @click="close" />
        <span class="font-semibold text-highlighted">Factura #{{ folio }}</span>
        <div class="flex-1" />
        <UBadge :color="getPaymentStatusColor(cab.EstatusPago || header?.EstatusPago)" class="font-semibold">
          {{ cab.EstatusPago || header?.EstatusPago }}
        </UBadge>
      </div>
    </template>

    <template #body>
      <div v-if="loading" class="flex justify-center items-center p-6" style="min-height: 80vh;">
        <UIcon name="i-lucide-loader-circle" class="animate-spin size-16 text-primary" />
      </div>

      <div v-else class="p-4 sm:p-6">
        <div class="grid grid-cols-12 gap-4">
          <!-- IZQUIERDA: factura -->
          <div class="col-span-12 lg:col-span-7">
            <UCard class="invoice-paper mx-auto" :ui="{ body: 'p-6 sm:p-8' }">
              <div class="flex justify-between items-start mb-6">
                <div>
                  <img
                    v-if="activeLogo"
                    :src="activeLogo"
                    :alt="empresaFactura?.label || 'Empresa'"
                    style="height: 64px; max-width: 220px; object-fit: contain;"
                  >
                  <div v-else class="text-2xl font-bold text-primary">
                    {{ empresaFactura?.label || 'Empresa' }}
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-xl font-bold">
                    FACTURA
                  </div>
                  <div class="text-base font-bold text-primary">
                    Folio #{{ folio }}
                  </div>
                  <div class="text-xs text-muted">
                    {{ fmtFecha(cab.Fecha) }}
                  </div>
                </div>
              </div>

              <USeparator class="mb-5" />

              <div class="grid grid-cols-12 gap-4 mb-6">
                <div class="col-span-7">
                  <p class="text-xs uppercase font-semibold text-muted mb-1">
                    Cliente
                  </p>
                  <p class="text-lg font-bold text-primary">
                    {{ cab.Cliente }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ cab.CardCode }} · Vendedor: {{ cab.Vendedor || '—' }}
                  </p>
                </div>
                <div class="col-span-5 text-right text-xs text-muted space-y-1">
                  <div>Moneda: <b class="text-highlighted">{{ cab.Moneda || 'MXN' }}</b></div>
                  <div>Vence: <b class="text-highlighted">{{ fmtFecha(cab.Vencimiento) }}</b></div>
                </div>
              </div>

              <!-- Partidas -->
              <div class="overflow-x-auto mb-6 border border-default rounded-lg">
                <table class="invoice-table w-full">
                  <thead>
                    <tr>
                      <th class="text-left">
                        Código
                      </th>
                      <th class="text-left">
                        Descripción
                      </th>
                      <th class="text-center">
                        Cant.
                      </th>
                      <th class="text-right">
                        Precio
                      </th>
                      <th class="text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(line, i) in detalle.lines" :key="i">
                      <td class="text-xs text-muted">
                        {{ line.ItemCode }}
                      </td>
                      <td class="text-sm">
                        {{ line.Dscription }}
                      </td>
                      <td class="text-center text-sm">
                        {{ line.Quantity }}
                      </td>
                      <td class="text-right text-sm">
                        {{ formatCurrency(line.Price, line.Currency) }}
                      </td>
                      <td class="text-right font-semibold">
                        {{ formatCurrency(line.LineTotal, line.Currency) }}
                      </td>
                    </tr>
                    <tr v-if="!detalle.lines.length">
                      <td colspan="5" class="text-center text-dimmed py-4">
                        No hay partidas cargadas.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Totales: Subtotal, IVA, Total -->
              <div class="flex justify-end">
                <div class="w-64 space-y-2">
                  <div class="flex justify-between text-sm">
                    <span class="text-muted">Subtotal</span>
                    <span class="font-semibold">{{ formatCurrency(cab.Subtotal, cab.Moneda) }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-muted">IVA</span>
                    <span class="font-semibold">{{ formatCurrency(cab.IVA, cab.Moneda) }}</span>
                  </div>
                  <USeparator />
                  <div class="flex justify-between text-base">
                    <span class="font-bold">Total</span>
                    <span class="font-bold text-primary">{{ formatCurrency(cab.Total, cab.Moneda) }}</span>
                  </div>
                  <div v-if="cab.Saldo != null" class="flex justify-between text-xs pt-1">
                    <span class="text-muted">Pagado</span>
                    <span class="text-success">{{ formatCurrency(cab.Pagado, cab.Moneda) }}</span>
                  </div>
                  <div v-if="cab.Saldo != null" class="flex justify-between text-xs">
                    <span class="text-muted">Saldo por cobrar</span>
                    <span :class="Number(cab.Saldo) > 0.1 ? 'text-warning font-bold' : 'text-success'">{{ formatCurrency(cab.Saldo, cab.Moneda) }}</span>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- DERECHA: margen + actividades -->
          <div class="col-span-12 lg:col-span-5 space-y-4">
            <!-- Margen -->
            <UCard>
              <div class="grid grid-cols-2 gap-4">
                <div class="text-center">
                  <div class="text-[0.65rem] font-bold text-primary tracking-widest mb-1">
                    MARGEN
                  </div>
                  <div :class="marginTextClass(header?.PorcentajeMargen)" class="text-2xl font-bold">
                    {{ formatPercent(header?.PorcentajeMargen) }}
                  </div>
                  <UProgress
                    :model-value="Math.max(0, Math.min(100, header?.PorcentajeMargen || 0))"
                    :color="getMarginColor(header?.PorcentajeMargen)"
                    class="mt-2"
                  />
                </div>
                <div class="text-center flex flex-col justify-center">
                  <div class="text-[0.65rem] font-bold text-muted tracking-widest mb-1">
                    UTILIDAD
                  </div>
                  <div class="text-2xl font-bold text-success">
                    {{ formatCurrency(header?.UtilidadMXN) }}
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Historial de actividades -->
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-mdi-history" class="text-primary size-4" />
                  <span class="font-bold text-primary text-xs tracking-wide">HISTORIAL DE ACTIVIDADES</span>
                </div>
              </template>

              <!-- Alta de actividad -->
              <div class="mb-6">
                <div class="flex items-center gap-2 mb-2">
                  <UInput
                    v-model="newLogText"
                    placeholder="Registrar nueva actividad..."
                    class="flex-1"
                    @keyup.enter="saveLog"
                  />
                  <UButton color="primary" :loading="savingLog" @click="saveLog">
                    Guardar
                  </UButton>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  <UButton
                    v-if="!m365Connected"
                    variant="ghost"
                    color="info"
                    size="sm"
                    icon="i-mdi-microsoft-office"
                    class="px-0"
                    @click="connectM365"
                  >
                    Conectar Microsoft To Do
                  </UButton>
                  <UBadge v-else color="success" variant="subtle" size="sm" icon="i-mdi-check">
                    Microsoft To Do Conectado
                  </UBadge>

                  <div class="flex-1" />

                  <UFormField label="Fecha Seguimiento" size="xs" style="max-width: 200px;">
                    <UInput
                      v-model="followUpDate"
                      type="date"
                      size="xs"
                      icon="i-mdi-calendar-clock"
                      class="w-full"
                    />
                  </UFormField>
                </div>
                <UAlert
                  v-if="m365Error"
                  color="warning"
                  variant="subtle"
                  icon="i-mdi-alert-outline"
                  class="mt-2"
                  close
                  @update:open="m365Error = false"
                >
                  <template #description>
                    Error al sincronizar con To Do. Por favor, <strong>reconecta</strong> tu cuenta de Microsoft.
                  </template>
                </UAlert>
                <p class="text-[0.7rem] text-dimmed mt-2">
                  Con una fecha de seguimiento, la actividad se registra como pendiente y (si conectaste Microsoft) como tarea en To Do.
                </p>
              </div>

              <!-- Línea de tiempo -->
              <div class="relative pl-5 border-l border-default space-y-5">
                <div v-for="log in logs" :key="log.LogID" class="relative">
                  <span
                    class="absolute -left-[27px] top-1.5 size-2.5 rounded-full ring-2 ring-default"
                    :class="log.Type === 'comment' ? 'bg-primary' : 'bg-success'"
                  />
                  <div class="flex justify-between items-center mb-1 gap-2">
                    <span class="text-sm font-semibold text-primary">{{ log.Author }}</span>
                    <span class="text-xs text-muted flex items-center gap-1">
                      <UIcon v-if="log.FollowUpDate" name="i-mdi-calendar-alert" class="size-3 text-warning" />
                      {{ fmtFechaHora(log.Date) }}
                    </span>
                  </div>
                  <p class="text-sm mb-1 text-muted">
                    {{ log.Text }}
                  </p>
                  <div v-if="log.FollowUpDate" class="text-xs text-warning font-semibold flex items-center gap-1">
                    <UIcon name="i-mdi-calendar-clock" class="size-3.5" />
                    Recordatorio: {{ fmtFecha(log.FollowUpDate) }}
                  </div>
                </div>
              </div>
              <div v-if="!logs.length" class="text-center py-4 text-dimmed italic">
                Sin actividad previa registrada.
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.invoice-paper { font-family: 'Poppins', sans-serif; min-height: 500px; max-width: 900px; }
.invoice-table th {
  text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em; font-weight: 700;
  padding: 8px 10px; border-bottom: 1px solid var(--ui-border);
}
.invoice-table td { padding: 8px 10px; border-bottom: 1px solid var(--ui-border); }
</style>
