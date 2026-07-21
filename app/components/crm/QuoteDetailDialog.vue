<script setup>
import { ref, watch, computed } from 'vue'
import axios from '~/utils/axios'
import { useCompanyStore } from '~/stores/company'
import CreateOpportunityDialog from '~/components/crm/CreateOpportunityDialog.vue'
import { useRouter } from 'vue-router'
import {
  stageOptions, motivoPerdidaOptions,
  isPerdida, requiresSeguimiento, requiresComentario
} from '~/config/crmStages'

// El store `customizer` de Vuetify no existe en Nuxt UI: el modo oscuro se lee
// con useColorMode() (@nuxtjs/color-mode, incluido en @nuxt/ui).
const colorMode = useColorMode()
const companyStore = useCompanyStore()
const isDark = computed(() => colorMode.value === 'dark')
// El quote-paper (color surface) cambia con el modo: en oscuro usa el logo
// claro de la empresa; en claro usa el printLogo (visible sobre blanco).
const activeLogo = computed(() => {
  const c = companyStore.company
  if (!c) return null
  return isDark.value ? (c.logoDark || c.logo) : (c.printLogo || c.logo)
})

const props = defineProps({
  modelValue: Boolean,
  folio: [Number, String],
  item: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'open-customer-history', 'update:item'])

const router = useRouter()
const showCreateOpp = ref(false)

const openCreateOpp = () => {
  showCreateOpp.value = true
}

const onOpportunityCreated = (data) => {
  // Vincular esta cotización al opp creado y avisar al padre
  emit('update:item', { ...props.item, OpportunityID: data.OpportunityID })
  router.push(`/app/crm/opportunities/${data.OpportunityID}`)
  internalModel.value = false
}

const goToOpportunity = () => {
  if (props.item?.OpportunityID) {
    router.push(`/app/crm/opportunities/${props.item.OpportunityID}`)
    internalModel.value = false
  }
}

const openPrintView = () => {
  if (!props.folio) return
  // Abrir en nueva pestaña para no perder el contexto del pipeline.
  // En Nuxt la ruta se resuelve por path (/print/quote/:folio), no por nombre.
  const url = router.resolve({
    path: `/print/quote/${props.folio}`,
    query: props.item?.SourceCompany ? { sourceCompany: props.item.SourceCompany } : {}
  }).href
  window.open(url, '_blank', 'noopener')
}

const sentimentOptions = ['Caliente', 'Tibio', 'Frio']
const tipoOptions = ['Proyecto', 'Transaccional']

const control = ref({
  Tipo: null,
  Etapa: null,
  Sentimiento: null,
  ProximaAccion: '',
  FechaCierre: null,
  MotivoPerdida: null,
  ComentarioPerdida: '',
  FechaSeguimiento: null
})

const showPerdidaFields = computed(() => isPerdida(control.value.Etapa))
const showSeguimientoField = computed(() => showPerdidaFields.value && requiresSeguimiento(control.value.MotivoPerdida))
const showComentarioField = computed(() => showPerdidaFields.value && requiresComentario(control.value.MotivoPerdida))

const toDateInputValue = (d) => {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date)) return null
  return date.toISOString().slice(0, 10)
}

const syncControlFromItem = () => {
  if (!props.item) return
  control.value = {
    Tipo: props.item.Tipo ?? null,
    Etapa: props.item.Etapa ?? null,
    Sentimiento: props.item.Sentimiento ?? null,
    ProximaAccion: props.item.ProximaAccion ?? '',
    FechaCierre: toDateInputValue(props.item.FechaCierre),
    MotivoPerdida: props.item.MotivoPerdida ?? null,
    ComentarioPerdida: props.item.ComentarioPerdida ?? '',
    FechaSeguimiento: toDateInputValue(props.item.FechaSeguimiento)
  }
}

watch(() => props.item, syncControlFromItem, { immediate: true, deep: true })

const updateControl = async () => {
  if (!props.folio) return
  try {
    await axios.post('/crm/pipeline/control', {
      Folio: props.folio,
      SourceCompany: props.item?.SourceCompany,
      Tipo: control.value.Tipo,
      Etapa: control.value.Etapa,
      ProximaAccion: control.value.ProximaAccion,
      Sentimiento: control.value.Sentimiento,
      FechaCierre: control.value.FechaCierre,
      MotivoPerdida: control.value.MotivoPerdida,
      ComentarioPerdida: control.value.ComentarioPerdida,
      FechaSeguimiento: control.value.FechaSeguimiento
    })
    emit('update:item', { ...props.item, ...control.value })
  } catch (error) {
    console.error('Error al actualizar control:', error)
  }
}

const getSentimentColor = (sentiment) => {
  switch (sentiment) {
    case 'Caliente': return 'error'
    case 'Tibio': return 'warning'
    case 'Frio': return 'info'
    default: return 'neutral'
  }
}

const internalModel = ref(props.modelValue)
const loading = ref(false)
const detail = ref(null)
const logs = ref([])
const newLogText = ref('')
const getToday = () => new Date().toISOString().split('T')[0]
const followUpDate = ref(getToday())
const savingLog = ref(false)
const m365Connected = ref(false)
const m365Error = ref(false)

const checkM365Status = async () => {
  try {
    const res = await axios.get('/m365/status')
    m365Connected.value = res.data.connected
  } catch (err) {
    console.error('Error checking M365 status:', err)
  }
}

const connectM365 = () => {
  m365Error.value = false

  // Obtener UID del token actual
  const token = localStorage.getItem('token')
  let uid = ''
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      uid = payload.uid
    } catch (e) { console.error('Error parsing token', e) }
  }

  if (!uid) {
    alert('Debes estar logueado para conectar Microsoft')
    return
  }

  const width = 600
  const height = 700
  const left = window.screen.width / 2 - width / 2
  const top = window.screen.height / 2 - height / 2

  // Escuchar el mensaje del popup
  const handleMessage = (event) => {
    if (event.data.type === 'm365_connected') {
      m365Connected.value = true
      window.removeEventListener('message', handleMessage)
    }
  }

  window.addEventListener('message', handleMessage)

  window.open(
    `${axios.defaults.baseURL}/m365/login?uid=${uid}`,
    'M365Auth',
    `width=${width},height=${height},left=${left},top=${top}`
  )
}

const showCustomerHistory = () => {
  if (detail.value?.header?.CardCode) {
    emit('open-customer-history', {
      cardCode: detail.value.header.CardCode,
      customerName: detail.value.header.Cliente
    })
  }
}

const utilityColumns = computed(() => [
  { accessorKey: 'Articulo', header: 'Artículo', enableSorting: false },
  { accessorKey: 'GananciaLineaDoc', header: `Utilidad (${detail.value?.header?.Moneda || 'MXN'})`, enableSorting: false },
  { accessorKey: 'MargenLinea', header: '% Margen', enableSorting: false }
])

watch(() => props.modelValue, (val) => {
  internalModel.value = val
  if (val && props.folio) {
    fetchData()
    checkM365Status()
  }
})

watch(internalModel, (val) => {
  emit('update:modelValue', val)
})

const sourceParams = computed(() => props.item?.SourceCompany ? { sourceCompany: props.item.SourceCompany } : {})

const fetchData = async () => {
  loading.value = true
  try {
    const [resDetail, resLogs] = await Promise.all([
      axios.get(`/crm/pipeline/detail/${props.folio}`, { params: sourceParams.value }),
      axios.get(`/crm/pipeline/logs/${props.folio}`, { params: sourceParams.value })
    ])
    detail.value = resDetail.data
    logs.value = resLogs.data
  } catch (error) {
    console.error('Error fetching detail:', error)
  } finally {
    loading.value = false
  }
}

const saveLog = async () => {
  if (!newLogText.value) return
  savingLog.value = true
  try {
    const response = await axios.post('/crm/pipeline/logs', {
      Folio: props.folio,
      SourceCompany: props.item?.SourceCompany,
      Text: newLogText.value,
      Type: 'comment',
      FollowUpDate: followUpDate.value,
      CardName: detail.value?.header?.Cliente
    })

    if (response.data.m365Error) {
      m365Error.value = true
      if (response.data.m365Error === 'InvalidAuthenticationToken' || response.data.m365Error.includes('401')) {
        m365Connected.value = false
      }
    }

    newLogText.value = ''
    followUpDate.value = getToday()
    fetchLogs()
  } catch (error) {
    console.error('Error saving log:', error)
  } finally {
    savingLog.value = false
  }
}

const fetchLogs = async () => {
  try {
    const res = await axios.get(`/crm/pipeline/logs/${props.folio}`, { params: sourceParams.value })
    logs.value = res.data
  } catch (err) {
    console.error(err)
  }
}

const close = () => {
  internalModel.value = false
}

const formatCurrency = (val, cur) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: cur || 'MXN' }).format(val)
}

const formatNumber = (val) => {
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const formatDate = (date) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString()
}

const formatDateTime = (date) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

const getMarginColor = (val) => {
  if (val < 10) return 'error'
  if (val < 25) return 'warning'
  return 'success'
}

// Clases de texto por color semántico (antes `text-${color}` de Vuetify)
const marginTextClass = val => ({
  error: 'text-error',
  warning: 'text-warning',
  success: 'text-success'
}[getMarginColor(val)])
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
        <span class="font-semibold text-highlighted">Detalle de Cotización: #{{ folio }}</span>
        <div class="flex-1" />
        <UButton
          variant="subtle"
          color="primary"
          icon="i-mdi-printer"
          :disabled="!folio"
          @click="openPrintView"
        >
          Imprimir
        </UButton>
        <UButton color="primary" icon="i-mdi-check-circle">
          Aprobar
        </UButton>
      </div>
    </template>

    <template #body>
      <div v-if="loading" class="flex justify-center items-center p-6" style="min-height: 80vh;">
        <UIcon name="i-lucide-loader-circle" class="animate-spin size-16 text-primary" />
      </div>

      <div v-else-if="detail" class="p-6">
        <div class="grid grid-cols-12 gap-4">
          <!-- IZQUIERDA: aspecto de cotización impresa -->
          <div class="col-span-12 lg:col-span-7">
            <UCard class="quote-paper mx-auto" :ui="{ body: 'p-8' }">
              <div class="flex justify-between items-start mb-8">
                <div>
                  <img
                    :src="activeLogo"
                    alt="Inovatech"
                    class="mb-2"
                    style="height: 80px;"
                  >
                </div>
                <div class="text-right">
                  <div class="text-xl font-bold mb-1">
                    COTIZACIÓN
                  </div>
                  <div class="text-base font-bold text-primary">
                    #{{ detail.header.Folio }}
                  </div>
                  <div class="text-xs text-muted">
                    {{ formatDate(detail.header.FechaContabilizacion) }}
                  </div>
                </div>
              </div>

              <USeparator class="mb-6" />

              <div class="grid grid-cols-12 gap-4 mb-8">
                <div class="col-span-6">
                  <p class="text-xs uppercase font-semibold text-muted mb-1">
                    Cliente
                  </p>
                  <p
                    class="text-lg font-bold mb-0 cursor-pointer text-primary underline"
                    @click="showCustomerHistory"
                  >
                    {{ detail.header.Cliente }}
                  </p>
                  <p class="text-xs text-muted">
                    Condiciones de pago: Crédito 30 días
                  </p>
                </div>
                <div class="col-span-6 text-right">
                  <p class="text-xs uppercase font-semibold text-muted mb-1">
                    Moneda
                  </p>
                  <p class="text-lg font-bold mb-0">
                    {{ detail.header.Moneda }}
                  </p>
                  <p v-if="detail.header.Moneda !== 'MXN'" class="text-xs text-muted">
                    T.C.: {{ formatNumber(detail.header.TC) }}
                  </p>
                </div>
              </div>

              <!-- Partidas -->
              <div class="overflow-x-auto mb-8 border border-default rounded-lg">
                <table class="quote-table w-full">
                  <thead>
                    <tr>
                      <th class="text-left">
                        Art.
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
                    <tr v-for="line in detail.lines" :key="line.NoLinea">
                      <td class="text-xs text-muted">
                        {{ line.Articulo }}
                      </td>
                      <td class="text-sm">
                        {{ line.Descripcion }}
                      </td>
                      <td class="text-center text-sm">
                        {{ line.Cantidad }}
                      </td>
                      <td class="text-right text-sm">
                        {{ formatCurrency(line.VentaNetaLinea / line.Cantidad, detail.header.Moneda) }}
                      </td>
                      <td class="text-right font-semibold">
                        {{ formatCurrency(line.VentaNetaLinea, detail.header.Moneda) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="flex justify-end">
                <div style="width: 250px">
                  <div class="flex justify-between mb-2">
                    <span class="text-muted">Subtotal:</span>
                    <span class="font-semibold">{{ formatCurrency(detail.header.Subtotal, detail.header.Moneda) }}</span>
                  </div>
                  <div class="flex justify-between mb-2">
                    <span class="text-muted">IVA:</span>
                    <span class="font-semibold">{{ formatCurrency(detail.header.IVA, detail.header.Moneda) }}</span>
                  </div>
                  <USeparator class="my-2" />
                  <div class="flex justify-between text-lg text-primary">
                    <span class="font-bold">TOTAL:</span>
                    <span class="font-bold">{{ formatCurrency(detail.header.Total, detail.header.Moneda) }}</span>
                  </div>
                </div>
              </div>

              <div class="mt-12 text-xs text-center text-dimmed">
                Este documento es una representación visual de la cotización en SAP Business One.
              </div>
            </UCard>
          </div>

          <!-- DERECHA: margen, control CRM y bitácora -->
          <div class="col-span-12 lg:col-span-5">
            <!-- KPIs globales -->
            <div class="grid grid-cols-12 gap-4 mb-4">
              <UCard class="col-span-6">
                <div class="flex flex-col items-center justify-center" style="min-height: 140px;">
                  <div class="text-xs font-bold text-primary mb-3 tracking-widest">
                    MARGEN GLOBAL
                  </div>
                  <div :class="marginTextClass(detail.header.MargenGlobal)" class="text-3xl font-bold">
                    {{ Math.ceil(detail.header.MargenGlobal) }}%
                  </div>
                  <UProgress
                    :model-value="detail.header.MargenGlobal"
                    :color="getMarginColor(detail.header.MargenGlobal)"
                    class="mt-3 w-full"
                  />
                </div>
              </UCard>
              <UCard class="col-span-6">
                <div class="flex flex-col items-center justify-center text-center" style="min-height: 140px;">
                  <div class="text-xs font-bold text-primary mb-4 tracking-widest">
                    UTILIDAD TOTAL
                  </div>
                  <div class="text-2xl font-bold text-success">
                    {{ formatCurrency(detail.header.GananciaBrutaDoc, detail.header.Moneda) }}
                  </div>
                  <div class="text-xs uppercase text-muted mt-4 tracking-wide">
                    {{ detail.header.Moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'PESOS MEXICANOS' }}
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Análisis por línea -->
            <UCard class="mb-4" :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-mdi-finance" class="text-success size-4" />
                  <span class="font-bold text-primary text-xs tracking-wide">ANÁLISIS POR LÍNEA</span>
                </div>
              </template>

              <UTable :data="detail.lines" :columns="utilityColumns">
                <template #GananciaLineaDoc-cell="{ row }">
                  <span class="font-semibold text-success">
                    {{ formatCurrency(row.original.GananciaLineaDoc, detail.header.Moneda) }}
                  </span>
                </template>
                <template #MargenLinea-cell="{ row }">
                  <div class="flex items-center gap-2" style="min-width: 120px;">
                    <UProgress
                      :model-value="row.original.MargenLinea"
                      :color="getMarginColor(row.original.MargenLinea)"
                      size="sm"
                      class="flex-1"
                    />
                    <span
                      :class="marginTextClass(row.original.MargenLinea)"
                      class="font-semibold text-sm text-right"
                      style="min-width: 45px;"
                    >
                      {{ Math.ceil(row.original.MargenLinea) }}%
                    </span>
                  </div>
                </template>
              </UTable>
            </UCard>

            <!-- Oportunidad -->
            <UCard class="mb-4">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-mdi-target" class="text-primary size-4" />
                  <span class="font-bold text-primary text-xs tracking-wide">OPORTUNIDAD</span>
                </div>
              </template>

              <div v-if="item?.OpportunityID" class="flex items-center gap-2 flex-wrap">
                <UBadge color="success" variant="subtle" icon="i-mdi-link-variant">
                  Vinculada a #{{ item.OpportunityID }} — {{ item.OpportunityName || 'Oportunidad' }}
                </UBadge>
                <div class="flex-1" />
                <UButton
                  size="sm"
                  variant="ghost"
                  color="primary"
                  icon="i-mdi-open-in-new"
                  @click="goToOpportunity"
                >
                  Abrir oportunidad
                </UButton>
              </div>
              <div v-else class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-muted">
                  Esta cotización no pertenece a ninguna oportunidad.
                </span>
                <div class="flex-1" />
                <UButton
                  color="primary"
                  size="sm"
                  icon="i-mdi-plus"
                  :disabled="!item?.CardCode"
                  @click="openCreateOpp"
                >
                  Crear / Unificar
                </UButton>
              </div>
            </UCard>

            <!-- Control CRM -->
            <UCard class="mb-4">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-mdi-tune-vertical" class="text-primary size-4" />
                  <span class="font-bold text-primary text-xs tracking-wide">CONTROL CRM</span>
                </div>
              </template>

              <div class="grid grid-cols-12 gap-3">
                <UFormField label="Tipo de Venta" class="col-span-12 sm:col-span-6">
                  <USelect
                    v-model="control.Tipo"
                    :items="tipoOptions"
                    class="w-full"
                    @update:model-value="updateControl"
                  />
                </UFormField>
                <UFormField label="Etapa" class="col-span-12 sm:col-span-6">
                  <USelect
                    v-model="control.Etapa"
                    :items="stageOptions"
                    class="w-full"
                    @update:model-value="updateControl"
                  />
                </UFormField>
                <UFormField label="Sentimiento" class="col-span-12 sm:col-span-6">
                  <USelect
                    v-model="control.Sentimiento"
                    :items="sentimentOptions"
                    class="w-full"
                    @update:model-value="updateControl"
                  >
                    <template #item-leading="{ item: opt }">
                      <UIcon
                        name="i-mdi-fire"
                        class="size-4"
                        :class="{
                          'text-error': getSentimentColor(opt) === 'error',
                          'text-warning': getSentimentColor(opt) === 'warning',
                          'text-info': getSentimentColor(opt) === 'info'
                        }"
                      />
                    </template>
                  </USelect>
                </UFormField>
                <UFormField label="Próxima Acción" class="col-span-12 sm:col-span-6">
                  <UInput
                    v-model="control.ProximaAccion"
                    class="w-full"
                    @blur="updateControl"
                  />
                </UFormField>
                <UFormField label="Fecha de Cierre Estimada" class="col-span-12 sm:col-span-6">
                  <UInput
                    v-model="control.FechaCierre"
                    type="date"
                    icon="i-mdi-calendar-check"
                    class="w-full"
                    @update:model-value="updateControl"
                  />
                </UFormField>

                <!-- Campos condicionales cuando Etapa = Perdida -->
                <template v-if="showPerdidaFields">
                  <UFormField label="Motivo de pérdida" class="col-span-12 sm:col-span-6">
                    <USelect
                      v-model="control.MotivoPerdida"
                      :items="motivoPerdidaOptions"
                      icon="i-mdi-alert-octagon-outline"
                      class="w-full"
                      @update:model-value="updateControl"
                    />
                  </UFormField>
                  <UFormField
                    v-if="showSeguimientoField"
                    label="Próximo seguimiento"
                    class="col-span-12 sm:col-span-6"
                  >
                    <UInput
                      v-model="control.FechaSeguimiento"
                      type="date"
                      icon="i-mdi-calendar-clock"
                      class="w-full"
                      @update:model-value="updateControl"
                    />
                  </UFormField>
                  <UFormField
                    v-if="showComentarioField"
                    label="Comentario del vendedor"
                    class="col-span-12"
                  >
                    <UTextarea
                      v-model="control.ComentarioPerdida"
                      :rows="2"
                      autoresize
                      class="w-full"
                      @blur="updateControl"
                    />
                  </UFormField>
                </template>
              </div>
            </UCard>

            <!-- Bitácora de actividades -->
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
                  <UBadge
                    v-else
                    color="success"
                    variant="subtle"
                    size="sm"
                    icon="i-mdi-check"
                  >
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
              </div>

              <!-- Línea de tiempo -->
              <div class="relative pl-5 border-l border-default space-y-5">
                <div
                  v-for="log in logs"
                  :key="log.LogID"
                  class="relative"
                >
                  <span
                    class="absolute -left-[27px] top-1.5 size-2.5 rounded-full ring-2 ring-default"
                    :class="log.Type === 'comment' ? 'bg-primary' : 'bg-success'"
                  />
                  <div class="flex justify-between items-center mb-1 gap-2">
                    <span class="text-sm font-semibold text-primary">{{ log.Author }}</span>
                    <span class="text-xs text-muted flex items-center gap-1">
                      <UIcon
                        v-if="log.FollowUpDate"
                        name="i-mdi-calendar-alert"
                        class="size-3 text-warning"
                      />
                      {{ formatDateTime(log.Date) }}
                    </span>
                  </div>
                  <p class="text-sm mb-1 text-muted">
                    {{ log.Text }}
                  </p>
                  <div v-if="log.FollowUpDate" class="text-xs text-warning font-semibold flex items-center gap-1">
                    <UIcon name="i-mdi-calendar-clock" class="size-3.5" />
                    Recordatorio: {{ formatDate(log.FollowUpDate) }}
                  </div>
                </div>
              </div>
              <div v-if="logs.length === 0" class="text-center py-4 text-dimmed italic">
                Sin actividad previa registrada.
              </div>
            </UCard>
          </div>
        </div>
      </div>

      <CreateOpportunityDialog
        v-model="showCreateOpp"
        :card-code="item?.CardCode"
        :customer-name="item?.Cliente"
        :initial-folio="folio"
        :source-company="item?.SourceCompany"
        @created="onOpportunityCreated"
      />
    </template>
  </UModal>
</template>

<style scoped>
.quote-paper {
  font-family: 'Poppins', sans-serif;
  min-height: 842px; /* Proporción A4 aprox */
  max-width: 900px;
}

.quote-table th {
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  font-weight: 700;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
}

.quote-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
}
</style>
