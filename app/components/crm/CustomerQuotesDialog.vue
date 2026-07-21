<script setup>
import { ref, watch, computed } from 'vue'
import axios from '~/utils/axios'

const props = defineProps({
  modelValue: Boolean,
  cardCode: String,
  customerName: String
})

const emit = defineEmits(['update:modelValue', 'open-quote-detail'])

const internalModel = ref(props.modelValue)
const activeTab = ref('overview')
const loadingHistory = ref(false)
const loadingDetail = ref(false)
const quotes = ref([])
const profile = ref(null)
const kpis = ref({ countOpen: 0, totalOpenMXN: 0, totalHistory: 0, countProject: 0, countTransactional: 0, sumProject: 0, sumTransactional: 0 })

const filters = ref({
  search: '',
  stage: null,
  type: null
})

const stageOptions = [
  '1. Dimensionamiento',
  '2. Negociación',
  '3. Aprobado/OC',
  '4. Colocado',
  '5. Perdida'
]

const quoteColumns = [
  { accessorKey: 'Folio', header: 'Folio' },
  { accessorKey: 'Tipo', header: 'Tipo' },
  { accessorKey: 'Etapa', header: 'Etapa' },
  { accessorKey: 'Fecha', header: 'Fecha' },
  { accessorKey: 'Estado', header: 'Estado' },
  { accessorKey: 'Moneda', header: 'Moneda' },
  { accessorKey: 'Total', header: 'Total' },
  { accessorKey: 'actions', header: '', enableSorting: false }
]

const filteredQuotes = computed(() => {
  return quotes.value.filter((q) => {
    const matchSearch = !filters.value.search
      || q.Folio.toString().includes(filters.value.search)
    const matchStage = !filters.value.stage || q.Etapa === filters.value.stage
    const matchType = !filters.value.type || q.Tipo === filters.value.type
    return matchSearch && matchStage && matchType
  })
})

// Generador de Resumen IA Dinámico (Conectado a Gemini)
const aiSummary = computed(() => {
  if (!profile.value || !profile.value.aiInsights) {
    return {
      behavior: 'Analizando historial completo con Gemini AI...',
      recommendation: 'Buscando oportunidades semánticas...',
      tags: []
    }
  }
  return profile.value.aiInsights
})

watch(() => props.modelValue, (val) => {
  internalModel.value = val
  if (val && props.cardCode) {
    fetchAllData()
  }
})

watch(internalModel, (val) => {
  emit('update:modelValue', val)
})

const fetchAllData = async () => {
  loadingHistory.value = true
  loadingDetail.value = true
  try {
    const [resQuotes, resProfile] = await Promise.all([
      axios.get(`/crm/pipeline/customer/${props.cardCode}`),
      axios.get(`/crm/pipeline/customer/detail/${props.cardCode}`)
    ])
    quotes.value = resQuotes.data.quotes
    kpis.value = resQuotes.data.kpis
    profile.value = resProfile.data
  } catch (error) {
    console.error('Error fetching customer 360 data:', error)
  } finally {
    loadingHistory.value = false
    loadingDetail.value = false
  }
}

const close = () => {
  internalModel.value = false
}

const openQuote = (folio) => {
  // IMPORTANTE: Para stack navigation (regresar al historial), NO cerramos este diálogo.
  // El Manager abrirá el detalle encima.
  emit('open-quote-detail', folio)
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short'
  })
}

const formatCurrency = (value, currency) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN'
  }).format(value || 0)
}

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'abierta': return 'success'
    case 'cerrada': return 'primary'
    case 'cancelada': return 'error'
    default: return 'neutral'
  }
}

const getStageColor = (stage) => {
  if (stage.includes('Perdida')) return 'text-error'
  if (stage.includes('Colocado')) return 'text-success'
  if (stage.includes('Aprobado')) return 'text-primary'
  return 'text-info'
}

const getCreditColor = (balance, limit) => {
  if (!limit) return 'neutral'
  const percent = (balance / limit) * 100
  if (percent > 90) return 'error'
  if (percent > 70) return 'warning'
  return 'success'
}

// Pestañas del 360 de cliente (antes v-tabs vertical + v-window)
const tabItems = [
  { value: 'overview', label: 'Resumen IA', icon: 'i-mdi-view-dashboard' },
  { value: 'history', label: 'Historial Cotizaciones', icon: 'i-mdi-history' },
  { value: 'profile', label: 'Perfil Corporativo', icon: 'i-mdi-account-details' },
  { value: 'financial', label: 'Situación Financiera', icon: 'i-mdi-cash-multiple' }
]

const creditPercent = computed(() => {
  if (!profile.value?.CreditLine) return 0
  return (profile.value.Balance / profile.value.CreditLine) * 100
})
</script>

<template>
  <UModal
    v-model:open="internalModel"
    fullscreen
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <div class="flex items-center gap-3 w-full">
        <UButton
          icon="i-mdi-close"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <span class="font-bold text-lg text-highlighted">{{ customerName }}</span>
        <UBadge
          v-if="profile?.RFC"
          color="primary"
          size="sm"
          class="font-semibold"
        >
          {{ profile.RFC }}
        </UBadge>

        <div class="flex-1" />

        <div class="hidden md:flex items-center gap-6">
          <div class="text-right border-r border-default pr-6">
            <div class="text-xs text-muted font-semibold">
              COTIZACIONES ABIERTAS
            </div>
            <div class="text-lg font-bold text-success">
              {{ kpis.countOpen }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-muted font-semibold">
              MONTO ABIERTO (MXN)
            </div>
            <div class="text-lg font-bold text-primary">
              {{ formatCurrency(kpis.totalOpenMXN) }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <div class="flex flex-col md:flex-row h-full">
        <!-- Barra lateral de navegación -->
        <div class="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-default py-6 px-3">
          <UTabs
            v-model="activeTab"
            :items="tabItems"
            orientation="vertical"
            color="primary"
            :content="false"
            class="w-full"
          />

          <USeparator class="my-6" />

          <div v-if="profile" class="px-1">
            <p class="text-xs uppercase font-semibold text-muted mb-2">
              Vendedor Asignado
            </p>
            <div class="flex items-center gap-3">
              <UAvatar
                :text="(profile.Vendedor || '').substring(0, 2)"
                size="sm"
              />
              <span class="text-sm font-semibold text-highlighted">
                {{ profile.Vendedor || 'No asignado' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Contenido -->
        <div class="flex-1 p-6 overflow-auto">
          <!-- RESUMEN IA -->
          <div v-if="activeTab === 'overview'" class="grid grid-cols-12 gap-6">
            <div class="col-span-12 lg:col-span-8">
              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-mdi-robot-outline" class="text-primary size-5" />
                    <span class="font-semibold text-highlighted">Inteligencia de Cliente (AI Insights)</span>
                  </div>
                </template>

                <div v-if="loadingDetail" class="text-center py-12">
                  <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-primary" />
                  <p class="mt-4 text-muted">
                    Analizando comportamiento del cliente...
                  </p>
                </div>
                <template v-else>
                  <UAlert
                    color="info"
                    variant="subtle"
                    icon="i-mdi-lightbulb-on"
                    class="mb-6"
                    title="Análisis de Compra:"
                    :description="aiSummary.behavior"
                  />

                  <div class="font-semibold mb-4 flex items-center gap-2 text-highlighted">
                    <UIcon name="i-mdi-trending-up" class="text-success size-5" />
                    Recomendación de Venta Cruzada
                  </div>
                  <div class="rounded-lg p-4 border border-success/40 bg-success/5">
                    <p class="text-sm font-medium">
                      {{ aiSummary.recommendation }}
                    </p>
                  </div>

                  <div class="mt-8">
                    <p class="text-xs uppercase font-bold text-dimmed mb-3">
                      PRODUCTOS MÁS COTIZADOS
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <UBadge
                        v-for="tag in aiSummary.tags"
                        :key="tag"
                        color="primary"
                        variant="outline"
                        size="sm"
                      >
                        {{ tag }}
                      </UBadge>
                    </div>
                  </div>
                </template>
              </UCard>
            </div>

            <div class="col-span-12 lg:col-span-4">
              <UCard class="h-full">
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-mdi-credit-card-outline" class="text-primary size-5" />
                    <span class="font-semibold text-highlighted">Crédito y Cobranza</span>
                  </div>
                </template>

                <template v-if="profile">
                  <div class="text-center mb-6">
                    <div class="text-xs text-muted">
                      Uso de Línea
                    </div>
                    <div class="text-2xl font-bold text-highlighted mb-3">
                      {{ Math.round(creditPercent) }}%
                    </div>
                    <UProgress
                      :model-value="creditPercent"
                      :color="getCreditColor(profile.Balance, profile.CreditLine)"
                    />
                  </div>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between items-center">
                      <span class="text-muted">Saldo Actual</span>
                      <span class="font-bold text-error">{{ formatCurrency(profile.Balance) }}</span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-muted">Límite de Crédito</span>
                      <span class="font-bold">{{ formatCurrency(profile.CreditLine) }}</span>
                    </div>
                    <USeparator class="my-2" />
                    <div class="flex justify-between items-center">
                      <span class="text-muted">Disponible</span>
                      <span class="font-bold text-success">{{ formatCurrency(profile.CreditAvailable) }}</span>
                    </div>
                  </div>
                </template>
              </UCard>
            </div>
          </div>

          <!-- HISTORIAL DE COTIZACIONES -->
          <div v-else-if="activeTab === 'history'">
            <!-- Mini KPIs -->
            <div class="grid grid-cols-12 gap-4 mb-6">
              <UCard class="col-span-12 sm:col-span-3">
                <div class="text-center">
                  <div class="text-xs uppercase tracking-wide text-muted">
                    Total Doctos
                  </div>
                  <div class="text-lg font-bold text-highlighted">
                    {{ kpis.totalHistory }}
                  </div>
                </div>
              </UCard>
              <UCard class="col-span-12 sm:col-span-3">
                <div class="text-center">
                  <div class="text-xs uppercase tracking-wide text-muted">
                    Proyectos
                  </div>
                  <div class="text-lg font-bold text-highlighted">
                    {{ formatCurrency(kpis.sumProject) }}
                  </div>
                  <div class="text-xs text-dimmed">
                    {{ kpis.countProject }} docs
                  </div>
                </div>
              </UCard>
              <UCard class="col-span-12 sm:col-span-3">
                <div class="text-center">
                  <div class="text-xs uppercase tracking-wide text-muted">
                    Transaccional
                  </div>
                  <div class="text-lg font-bold text-highlighted">
                    {{ formatCurrency(kpis.sumTransactional) }}
                  </div>
                  <div class="text-xs text-dimmed">
                    {{ kpis.countTransactional }} docs
                  </div>
                </div>
              </UCard>
              <UCard class="col-span-12 sm:col-span-3">
                <div class="text-center">
                  <div class="text-xs uppercase tracking-wide text-primary">
                    Monto Abierto
                  </div>
                  <div class="text-lg font-bold text-primary">
                    {{ formatCurrency(kpis.totalOpenMXN) }}
                  </div>
                  <div class="text-xs text-dimmed">
                    {{ kpis.countOpen }} docs
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Filtros -->
            <UCard class="mb-4">
              <div class="grid grid-cols-12 gap-3 items-end">
                <UFormField label="Buscar" class="col-span-12 md:col-span-4">
                  <UInput
                    v-model="filters.search"
                    icon="i-mdi-magnify"
                    placeholder="Buscar folio o descripción..."
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Etapa" class="col-span-12 md:col-span-3">
                  <USelect
                    v-model="filters.stage"
                    :items="stageOptions"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Tipo" class="col-span-12 md:col-span-3">
                  <USelect
                    v-model="filters.type"
                    :items="['Proyecto', 'Transaccional']"
                    class="w-full"
                  />
                </UFormField>
                <div class="col-span-12 md:col-span-2 flex justify-end">
                  <UButton
                    icon="i-mdi-refresh"
                    variant="ghost"
                    color="primary"
                    :loading="loadingHistory"
                    @click="fetchAllData"
                  />
                </div>
              </div>
            </UCard>

            <!-- Tabla -->
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <UTable
                :data="filteredQuotes"
                :columns="quoteColumns"
                :loading="loadingHistory"
              >
                <template #Folio-cell="{ row }">
                  <span
                    class="font-bold text-primary cursor-pointer underline"
                    @click="openQuote(row.original.Folio)"
                  >
                    #{{ row.original.Folio }}
                  </span>
                </template>
                <template #Tipo-cell="{ row }">
                  <UBadge
                    :color="row.original.Tipo === 'Proyecto' ? 'primary' : 'info'"
                    size="sm"
                    class="font-semibold"
                  >
                    {{ row.original.Tipo }}
                  </UBadge>
                </template>
                <template #Etapa-cell="{ row }">
                  <span :class="getStageColor(row.original.Etapa)" class="text-xs font-semibold">
                    {{ row.original.Etapa }}
                  </span>
                </template>
                <template #Fecha-cell="{ row }">
                  <span class="text-xs">{{ formatDate(row.original.Fecha) }}</span>
                </template>
                <template #Total-cell="{ row }">
                  <span class="font-semibold">{{ formatCurrency(row.original.Total, row.original.Moneda) }}</span>
                </template>
                <template #Estado-cell="{ row }">
                  <UBadge
                    :color="getStatusColor(row.original.Estado)"
                    variant="subtle"
                    size="sm"
                    class="uppercase font-semibold"
                  >
                    {{ row.original.Estado }}
                  </UBadge>
                </template>
                <template #actions-cell="{ row }">
                  <UButton
                    icon="i-mdi-eye"
                    size="xs"
                    variant="ghost"
                    color="primary"
                    @click="openQuote(row.original.Folio)"
                  />
                </template>
              </UTable>
            </UCard>
          </div>

          <!-- PERFIL CORPORATIVO -->
          <div v-else-if="activeTab === 'profile'" class="grid grid-cols-12 gap-6">
            <div class="col-span-12 md:col-span-6">
              <UCard>
                <template #header>
                  <span class="font-semibold text-highlighted">Datos de Facturación</span>
                </template>
                <template v-if="profile">
                  <div class="text-lg font-bold mb-4 text-primary">
                    {{ profile.CardName }}
                  </div>
                  <div class="flex gap-2 mb-2">
                    <UIcon name="i-mdi-map-marker" class="size-4 text-dimmed shrink-0 mt-0.5" />
                    <div class="text-sm">
                      {{ profile.BillStreet }} {{ profile.BillNo }}, {{ profile.BillBlock }}<br>
                      {{ profile.BillCity }}, {{ profile.BillState }}, CP {{ profile.BillCP }}
                    </div>
                  </div>
                  <div class="flex mt-4 pt-4 border-t border-default gap-8">
                    <div>
                      <p class="text-xs text-dimmed mb-0">
                        Condiciones
                      </p>
                      <p class="text-sm font-semibold">
                        {{ profile.PaymentTerms }}
                      </p>
                    </div>
                    <div>
                      <p class="text-xs text-dimmed mb-0">
                        RFC
                      </p>
                      <p class="text-sm font-semibold">
                        {{ profile.RFC }}
                      </p>
                    </div>
                  </div>
                </template>
              </UCard>
            </div>
            <div class="col-span-12 md:col-span-6 space-y-6">
              <UCard>
                <template #header>
                  <span class="font-semibold text-highlighted">Dirección de Entrega</span>
                </template>
                <div v-if="profile" class="flex gap-2">
                  <UIcon name="i-mdi-truck-delivery-outline" class="size-4 text-dimmed shrink-0 mt-0.5" />
                  <div class="text-sm">
                    {{ profile.ShipStreet }} {{ profile.ShipNo }}, {{ profile.ShipBlock }}<br>
                    {{ profile.ShipCity }}, {{ profile.ShipState }}, CP {{ profile.ShipCP }}
                  </div>
                </div>
              </UCard>
              <UCard>
                <template #header>
                  <span class="font-semibold text-highlighted">Contacto Directo</span>
                </template>
                <div v-if="profile" class="space-y-3 text-sm">
                  <div class="flex items-center gap-3">
                    <UIcon name="i-mdi-account" class="size-4 text-dimmed shrink-0" />
                    <div>
                      <div class="text-highlighted">
                        {{ profile.CntctPrsn }}
                      </div>
                      <div class="text-xs text-muted">
                        Contacto Principal
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <UIcon name="i-mdi-email" class="size-4 text-dimmed shrink-0" />
                    <span>{{ profile.E_Mail }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <UIcon name="i-mdi-phone" class="size-4 text-dimmed shrink-0" />
                    <span>{{ profile.Phone1 }} / {{ profile.Phone2 }}</span>
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- SITUACIÓN FINANCIERA -->
          <div v-else-if="activeTab === 'financial'">
            <UCard :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-highlighted">Resumen Financiero Consolidado</span>
                  <div class="flex-1" />
                  <UBadge color="info" size="sm">
                    SAP B1 OCRD
                  </UBadge>
                </div>
              </template>

              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-default">
                      <th class="text-left font-semibold p-3">
                        CONCEPTO
                      </th>
                      <th class="text-right font-semibold p-3">
                        LOCAL (MXN)
                      </th>
                      <th class="text-right font-semibold p-3">
                        SISTEMA (USD)
                      </th>
                    </tr>
                  </thead>
                  <tbody v-if="profile">
                    <tr class="border-b border-default">
                      <td class="p-3">
                        Saldo de Cuenta
                      </td>
                      <td class="p-3 text-right text-error font-semibold">
                        {{ formatCurrency(profile.Balance) }}
                      </td>
                      <td class="p-3 text-right">
                        {{ formatCurrency(profile.BalanceSys, 'USD') }}
                      </td>
                    </tr>
                    <tr class="border-b border-default">
                      <td class="p-3">
                        Límite de Crédito
                      </td>
                      <td class="p-3 text-right">
                        {{ formatCurrency(profile.CreditLine) }}
                      </td>
                      <td class="p-3 text-right text-dimmed">
                        -
                      </td>
                    </tr>
                    <tr class="bg-elevated">
                      <td class="p-3 font-bold text-primary">
                        Disponible
                      </td>
                      <td class="p-3 text-right font-bold text-primary">
                        {{ formatCurrency(profile.CreditAvailable) }}
                      </td>
                      <td class="p-3 text-right text-dimmed">
                        -
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
