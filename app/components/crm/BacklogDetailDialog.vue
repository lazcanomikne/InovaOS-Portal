<script setup>
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from '~/utils/axios'
import QuoteDetailDialog from '~/components/crm/QuoteDetailDialog.vue'
import { stageColors } from '~/config/crmStages'

const props = defineProps({
  modelValue: Boolean,
  docNum: [Number, String],
  sourceCompany: { type: String, default: null }
})
const emit = defineEmits(['update:modelValue'])

const internal = ref(props.modelValue)
const loading = ref(false)
const data = ref(null)
const router = useRouter()

const showQuoteDialog = ref(false)
const selectedQuoteFolio = ref(null)

watch(() => props.modelValue, (v) => {
  internal.value = v
  if (v && props.docNum) fetchDetail()
})
watch(internal, v => emit('update:modelValue', v))

const fetchDetail = async () => {
  loading.value = true
  data.value = null
  try {
    const res = await axios.get(`/crm/backlog/${props.docNum}`, {
      params: props.sourceCompany ? { sourceCompany: props.sourceCompany } : {}
    })
    data.value = res.data
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const close = () => { internal.value = false }

const openQuote = (folio) => {
  selectedQuoteFolio.value = folio
  showQuoteDialog.value = true
}

const openOpportunity = () => {
  if (data.value?.opportunity?.OpportunityID) {
    router.push(`/app/crm/opportunities/${data.value.opportunity.OpportunityID}`)
    close()
  }
}

// Stock por línea: estado relativo a OpenQty
const lineStockStatus = (line) => {
  if (line.PendienteEntrega <= 0) return 'delivered'
  if (line.StockDisponible >= line.PendienteEntrega) return 'full'
  if (line.StockDisponible <= 0) return 'none'
  return 'partial'
}
const stockColor = s => ({
  delivered: 'neutral',
  full: 'success',
  partial: 'warning',
  none: 'error'
}[s] || 'neutral')
const stockIcon = s => ({
  delivered: 'i-mdi-check-decagram',
  full: 'i-mdi-check-circle',
  partial: 'i-mdi-alert',
  none: 'i-mdi-close-circle'
}[s] || 'i-mdi-help')
const stockLabel = s => ({
  delivered: 'Entregado',
  full: 'Disponible',
  partial: 'Parcial',
  none: 'Sin stock'
}[s] || '—')

const formatCurrency = (v, c) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: c || 'MXN' }).format(v || 0)
const formatNumber = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v || 0)
const formatDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—'

const daysUntilDue = (date) => {
  if (!date) return null
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((d - t) / (1000 * 60 * 60 * 24))
}

const lineColumns = [
  { accessorKey: 'NoLinea', header: '#' },
  { accessorKey: 'Articulo', header: 'Artículo' },
  { accessorKey: 'Descripcion', header: 'Descripción' },
  { accessorKey: 'Cantidad', header: 'Cant.' },
  { accessorKey: 'Entregado', header: 'Entregado' },
  { accessorKey: 'PendienteEntrega', header: 'Pendiente' },
  { accessorKey: 'StockStatus', header: 'Stock' },
  { accessorKey: 'TotalLinea', header: 'Total' },
  { accessorKey: 'FolioCotizacionOrigen', header: 'Origen' }
]

// Color del chip de entrega (antes era una IIFE dentro del template)
const dueColor = (date) => {
  const d = daysUntilDue(date)
  if (d === null) return 'neutral'
  if (d < 0) return 'error'
  if (d <= 3) return 'warning'
  return 'success'
}

const stockPercent = computed(() => {
  const s = data.value?.stockSummary
  if (!s) return 100
  return s.linesOpen > 0 ? (s.linesFullStock / s.linesOpen) * 100 : 100
})

const stockSummaryColor = computed(() => {
  const s = data.value?.stockSummary
  if (!s || s.linesOpen === 0) return 'success'
  if (s.linesFullStock === s.linesOpen) return 'success'
  return s.linesFullStock === 0 ? 'error' : 'warning'
})
</script>

<template>
  <UModal
    v-model:open="internal"
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
        <UIcon name="i-mdi-truck-fast-outline" class="text-primary size-5" />
        <span class="font-semibold text-highlighted">Pedido #{{ docNum }}</span>
        <div class="flex-1" />
      </div>
    </template>

    <template #body>
      <div v-if="loading" class="flex justify-center items-center p-6" style="min-height: 80vh;">
        <UIcon name="i-lucide-loader-circle" class="animate-spin size-16 text-primary" />
      </div>

      <div v-else-if="data" class="p-6">
        <div class="grid grid-cols-12 gap-4">
          <!-- Cabecera del pedido -->
          <div class="col-span-12 md:col-span-8">
            <UCard>
              <div class="flex justify-between items-start mb-3 gap-3">
                <div>
                  <div class="text-xs text-muted uppercase">
                    Cliente
                  </div>
                  <div class="text-lg font-bold text-highlighted">
                    {{ data.header.Cliente }}
                  </div>
                  <div class="text-sm text-muted">
                    {{ data.header.CardCode }}
                  </div>
                </div>
                <div class="text-right">
                  <UBadge
                    :color="dueColor(data.header.FechaEntrega)"
                    variant="subtle"
                    icon="i-mdi-calendar-check"
                    class="font-semibold"
                  >
                    Entrega: {{ formatDate(data.header.FechaEntrega) }}
                  </UBadge>
                </div>
              </div>

              <USeparator class="my-2" />

              <div class="grid grid-cols-12 gap-3">
                <div class="col-span-6 md:col-span-3">
                  <div class="text-xs text-muted">
                    Pedido
                  </div>
                  <div class="font-semibold">
                    {{ formatDate(data.header.FechaPedido) }}
                  </div>
                </div>
                <div class="col-span-6 md:col-span-3">
                  <div class="text-xs text-muted">
                    Vendedor
                  </div>
                  <div class="font-semibold">
                    {{ data.header.Vendedor }}
                  </div>
                </div>
                <div class="col-span-6 md:col-span-3">
                  <div class="text-xs text-muted">
                    Moneda
                  </div>
                  <div class="font-semibold">
                    {{ data.header.Moneda }}
                  </div>
                </div>
                <div class="col-span-6 md:col-span-3">
                  <div class="text-xs text-muted">
                    Total
                  </div>
                  <div class="font-semibold text-primary">
                    {{ formatCurrency(data.header.Total, data.header.Moneda) }}
                  </div>
                </div>
                <div v-if="data.header.Referencia" class="col-span-12">
                  <div class="text-xs text-muted flex items-center gap-1">
                    <UIcon name="i-mdi-tag-outline" class="size-3.5" />
                    Referencia cliente
                  </div>
                  <div class="font-medium">
                    {{ data.header.Referencia }}
                  </div>
                </div>
                <div v-if="data.header.Comentarios" class="col-span-12">
                  <div class="text-xs text-muted flex items-center gap-1">
                    <UIcon name="i-mdi-comment-text-outline" class="size-3.5" />
                    Comentarios
                  </div>
                  <div class="text-sm">
                    {{ data.header.Comentarios }}
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- KPI de stock -->
          <div class="col-span-12 md:col-span-4">
            <UCard class="h-full">
              <div class="text-xs uppercase text-primary font-bold mb-3 tracking-wide">
                SURTIDO DEL PEDIDO
              </div>
              <div class="mb-3">
                <div class="flex items-baseline gap-2 mb-2">
                  <span class="text-2xl font-bold text-highlighted">{{ Math.round(stockPercent) }}%</span>
                  <span class="text-xs text-muted">con stock</span>
                </div>
                <UProgress :model-value="stockPercent" :color="stockSummaryColor" />
                <div class="mt-3 text-sm space-y-0.5">
                  <div><strong>{{ data.stockSummary.linesFullStock }}</strong> líneas con stock</div>
                  <div><strong>{{ data.stockSummary.linesPartialStock }}</strong> parciales</div>
                  <div v-if="data.stockSummary.linesNoStock > 0" class="text-error">
                    <strong>{{ data.stockSummary.linesNoStock }}</strong> sin stock
                  </div>
                </div>
              </div>

              <UAlert
                v-if="data.stockSummary.linesNoStock > 0"
                color="error"
                variant="subtle"
                icon="i-mdi-close-circle"
                class="mt-2"
                title="Hay líneas sin stock disponible. Revisar compras o sustitutos."
              />
              <UAlert
                v-else-if="data.stockSummary.linesPartialStock > 0"
                color="warning"
                variant="subtle"
                icon="i-mdi-alert"
                class="mt-2"
                title="Hay líneas con stock parcial. Entrega podría requerir surtido por partes."
              />
              <UAlert
                v-else-if="data.stockSummary.linesOpen === 0"
                color="success"
                variant="subtle"
                icon="i-mdi-check-decagram"
                class="mt-2"
                title="Pedido completamente entregado."
              />
              <UAlert
                v-else
                color="success"
                variant="subtle"
                icon="i-mdi-check-circle"
                class="mt-2"
                title="Stock disponible para todas las líneas pendientes."
              />
            </UCard>
          </div>
        </div>

        <!-- Tabla de líneas con stock -->
        <UCard class="mt-4" :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-mdi-package-variant-closed" class="text-primary size-5" />
              <span class="font-semibold text-highlighted">Líneas del pedido</span>
            </div>
          </template>

          <UTable :data="data.lines" :columns="lineColumns">
            <template #Articulo-cell="{ row }">
              <span class="text-xs text-muted font-medium">{{ row.original.Articulo }}</span>
            </template>
            <template #Descripcion-cell="{ row }">
              <span class="text-sm">{{ row.original.Descripcion }}</span>
            </template>
            <template #Cantidad-cell="{ row }">
              {{ formatNumber(row.original.Cantidad) }}
            </template>
            <template #Entregado-cell="{ row }">
              <span class="text-success font-semibold">{{ formatNumber(row.original.Entregado) }}</span>
            </template>
            <template #PendienteEntrega-cell="{ row }">
              <span :class="row.original.PendienteEntrega > 0 ? 'text-warning font-semibold' : 'text-dimmed'">
                {{ formatNumber(row.original.PendienteEntrega) }}
              </span>
            </template>
            <template #StockStatus-cell="{ row }">
              <UTooltip
                :text="`Disponible: ${formatNumber(row.original.StockDisponible)} / Comprometido: ${formatNumber(row.original.StockComprometido)} / Total: ${formatNumber(row.original.StockTotal)}`"
              >
                <UBadge
                  :color="stockColor(lineStockStatus(row.original))"
                  :icon="stockIcon(lineStockStatus(row.original))"
                  variant="subtle"
                  size="sm"
                  class="font-semibold"
                >
                  {{ stockLabel(lineStockStatus(row.original)) }}
                </UBadge>
              </UTooltip>
            </template>
            <template #TotalLinea-cell="{ row }">
              <span class="font-semibold">{{ formatCurrency(row.original.TotalLinea, data.header.Moneda) }}</span>
            </template>
            <template #FolioCotizacionOrigen-cell="{ row }">
              <UBadge
                v-if="row.original.FolioCotizacionOrigen"
                size="sm"
                variant="subtle"
                color="primary"
                class="cursor-pointer"
                @click="openQuote(row.original.FolioCotizacionOrigen)"
              >
                #{{ row.original.FolioCotizacionOrigen }}
              </UBadge>
              <span v-else class="text-xs text-dimmed">—</span>
            </template>
          </UTable>
        </UCard>

        <!-- Origen: oportunidad (si aplica) -->
        <UCard v-if="data.opportunity" class="mt-4">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-mdi-target" class="text-primary size-5" />
              <span class="font-semibold text-highlighted">Oportunidad de origen</span>
            </div>
          </template>

          <div class="flex items-center gap-3 flex-wrap">
            <div>
              <div class="text-lg font-bold text-highlighted">
                #{{ data.opportunity.OpportunityID }} — {{ data.opportunity.Name }}
              </div>
              <div class="text-sm text-muted flex items-center gap-2 flex-wrap">
                <span>Etapa:</span>
                <UBadge
                  size="sm"
                  :color="stageColors[data.opportunity.Etapa] || 'neutral'"
                  variant="subtle"
                >
                  {{ data.opportunity.Etapa }}
                </UBadge>
                <span v-if="data.opportunity.FechaCierre">
                  Cierre estimado: <strong>{{ formatDate(data.opportunity.FechaCierre) }}</strong>
                </span>
              </div>
            </div>
            <div class="flex-1" />
            <UButton color="primary" icon="i-mdi-open-in-new" @click="openOpportunity">
              Abrir oportunidad
            </UButton>
          </div>
        </UCard>

        <!-- Origen: cotizaciones -->
        <UCard v-if="data.cotizaciones.length > 0" class="mt-4" :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-mdi-file-document-multiple" class="text-primary size-5" />
              <span class="font-semibold text-highlighted">
                Cotizaciones de origen ({{ data.cotizaciones.length }})
              </span>
            </div>
          </template>

          <div class="divide-y divide-default">
            <div
              v-for="cot in data.cotizaciones"
              :key="cot.Folio"
              class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-elevated/50"
              @click="openQuote(cot.Folio)"
            >
              <UIcon name="i-mdi-file-document-outline" class="text-primary size-5 shrink-0" />
              <div class="flex items-center gap-2 flex-wrap min-w-0">
                <span class="font-bold text-primary">#{{ cot.Folio }}</span>
                <UBadge size="sm" :color="stageColors[cot.Etapa] || 'neutral'" variant="subtle">
                  {{ cot.Etapa }}
                </UBadge>
                <span class="text-sm text-muted">
                  {{ formatDate(cot.Fecha) }} · {{ formatCurrency(cot.Monto, cot.Moneda) }}
                </span>
              </div>
              <div class="flex-1" />
              <UIcon name="i-mdi-open-in-new" class="size-4 text-dimmed shrink-0" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Diálogo anidado para ver el detalle de una cotización origen -->
      <QuoteDetailDialog
        v-model="showQuoteDialog"
        :folio="selectedQuoteFolio"
        :item="null"
      />
    </template>
  </UModal>
</template>
