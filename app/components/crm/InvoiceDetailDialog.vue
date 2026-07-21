<script setup>
import { ref, watch } from 'vue'
import axios from '~/utils/axios'

const props = defineProps({
  modelValue: Boolean,
  folio: [Number, String],
  docEntry: [Number, String],
  header: Object
})
const emit = defineEmits(['update:modelValue'])

const internalModel = ref(props.modelValue)
const loading = ref(false)
const lines = ref([])
watch(() => props.modelValue, (val) => {
  internalModel.value = val
  if (val && props.docEntry) {
    fetchLines()
  }
})

watch(internalModel, (val) => {
  emit('update:modelValue', val)
})

const fetchLines = async () => {
  loading.value = true
  try {
    const response = await axios.get(`/crm/invoices/${props.docEntry}`)
    lines.value = response.data
  } catch (error) {
    console.error('Error fetching invoice lines:', error)
  } finally {
    loading.value = false
  }
}

const close = () => {
  internalModel.value = false
}

// Formatters
const formatCurrency = (value, currency) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN'
  }).format(value)
}

const formatPercent = (value) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format((value || 0) / 100)
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('es-MX')
}

const getMarginColor = (margin) => {
  if (margin > 20) return 'success'
  if (margin < 10) return 'error'
  return 'warning'
}

const getPaymentStatusColor = (status) => {
  switch (status) {
    case 'Pagada': return 'success'
    case 'Parcial': return 'warning'
    case 'Pendiente': return 'error'
    default: return 'neutral'
  }
}

// Clase de texto por color semántico (antes `text-${color}` de Vuetify)
const marginTextClass = margin => ({
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning'
}[getMarginColor(margin)])
</script>

<template>
  <UModal
    v-model:open="internalModel"
    fullscreen
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <div class="flex items-center gap-2 w-full">
        <UButton
          icon="i-mdi-close"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <span class="font-semibold text-highlighted">Detalle de Factura: #{{ folio }}</span>
        <div class="flex-1" />
        <UBadge :color="getPaymentStatusColor(header?.EstatusPago)" class="font-semibold">
          {{ header?.EstatusPago }}
        </UBadge>
      </div>
    </template>

    <template #body>
      <div v-if="loading" class="flex justify-center items-center p-6" style="min-height: 80vh;">
        <UIcon name="i-lucide-loader-circle" class="animate-spin size-16 text-primary" />
      </div>

      <div v-else class="p-6">
        <div class="grid grid-cols-12 gap-4">
          <!-- IZQUIERDA: aspecto de factura -->
          <div class="col-span-12 lg:col-span-7">
            <UCard class="invoice-paper mx-auto" :ui="{ body: 'p-8' }">
              <div class="flex justify-between items-start mb-8">
                <div>
                  <div class="text-3xl font-bold text-primary mb-2">
                    INOVATECH
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-xl font-bold mb-1">
                    FACTURA
                  </div>
                  <div class="text-base font-bold text-primary">
                    Folio #{{ folio }}
                  </div>
                  <div class="text-xs text-muted">
                    {{ formatDate(header?.Fecha) }}
                  </div>
                </div>
              </div>

              <USeparator class="mb-6" />

              <div class="grid grid-cols-12 gap-4 mb-8">
                <div class="col-span-6">
                  <p class="text-xs uppercase font-semibold text-muted mb-1">
                    Cliente
                  </p>
                  <p class="text-lg font-bold mb-0 text-primary">
                    {{ header?.Cliente }}
                  </p>
                  <p class="text-xs text-muted">
                    Vendedor: {{ header?.Vendedor }}
                  </p>
                </div>
                <div class="col-span-6 text-right">
                  <p class="text-xs uppercase font-semibold text-muted mb-1">
                    Importes
                  </p>
                  <div class="flex flex-col items-end">
                    <span class="text-lg font-bold">{{ formatCurrency(header?.VentaNetaMXN) }}</span>
                    <span class="text-xs text-dimmed">USD: {{ formatCurrency(header?.VentaNetaUSD, 'USD') }}</span>
                  </div>
                </div>
              </div>

              <!-- Partidas -->
              <div class="overflow-x-auto mb-8 border border-default rounded-lg">
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
                    <tr v-for="line in lines" :key="line.ItemCode">
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
                    <tr v-if="lines.length === 0">
                      <td colspan="5" class="text-center text-dimmed py-4">
                        No hay partidas cargadas.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="flex justify-end">
                <div style="width: 250px">
                  <div class="flex justify-between mb-2">
                    <span class="text-muted">Subtotal (MXN):</span>
                    <span class="font-semibold">{{ formatCurrency(header?.VentaNetaMXN) }}</span>
                  </div>
                  <div class="flex justify-between mb-2">
                    <span class="text-muted">Utilidad (MXN):</span>
                    <span class="font-semibold text-success">{{ formatCurrency(header?.UtilidadMXN) }}</span>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- DERECHA: KPI de margen -->
          <div class="col-span-12 lg:col-span-5">
            <UCard>
              <div class="flex flex-col items-center justify-center" style="min-height: 200px;">
                <div class="text-xs font-bold text-primary mb-3 tracking-widest">
                  MARGEN DE LA FACTURA
                </div>
                <div :class="marginTextClass(header?.PorcentajeMargen)" class="text-4xl font-bold my-4">
                  {{ formatPercent(header?.PorcentajeMargen) }}
                </div>
                <UProgress
                  :model-value="header?.PorcentajeMargen || 0"
                  :color="getMarginColor(header?.PorcentajeMargen)"
                  class="w-full"
                />
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.invoice-paper {
  font-family: 'Poppins', sans-serif;
  min-height: 600px;
  max-width: 900px;
}

.invoice-table th {
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  font-weight: 700;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
}

.invoice-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
}
</style>
