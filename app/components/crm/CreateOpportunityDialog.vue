<script setup>
import { ref, watch, computed } from 'vue'
import axios from '~/utils/axios'
import { stageOptions } from '~/config/crmStages'

const props = defineProps({
  modelValue: Boolean,
  cardCode: String,
  customerName: String,
  initialFolio: [Number, String],
  opportunityId: { type: [Number, String], default: null },
  sourceCompany: { type: String, default: null }
})
const emit = defineEmits(['update:modelValue', 'created'])

const internal = ref(props.modelValue)
watch(() => props.modelValue, v => internal.value = v)
watch(internal, v => emit('update:modelValue', v))

const loading = ref(false)
const saving = ref(false)
const availableQuotes = ref([])
const selectedFolios = ref([])
const name = ref('')
const fechaCierre = ref(null)
const notas = ref('')
const error = ref(null)

const etapa = ref(stageOptions[0])

const totalSum = computed(() => {
  return availableQuotes.value
    .filter(q => selectedFolios.value.includes(q.Folio))
    .reduce((acc, q) => acc + (q.Monto || 0), 0)
})

const formatCurrency = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const formatDate = d => d ? new Date(d).toLocaleDateString('es-MX') : ''

const loadAvailable = async () => {
  if (!props.cardCode) return
  loading.value = true
  error.value = null
  try {
    const res = await axios.get(`/crm/opportunities/customer/${props.cardCode}/available-quotes`, {
      params: props.opportunityId ? { opportunityId: props.opportunityId } : {}
    })
    availableQuotes.value = res.data
    // Por defecto preseleccionar el folio desde el que se abrió la creación
    if (props.initialFolio) {
      const folioNum = Number(props.initialFolio)
      if (availableQuotes.value.some(q => q.Folio === folioNum)) {
        selectedFolios.value = [folioNum]
      }
    }
    // Nombre sugerido
    if (!name.value && props.customerName) {
      name.value = `Oportunidad ${props.customerName} ${new Date().toLocaleDateString('es-MX')}`
    }
  } catch (e) {
    error.value = e.response?.data?.msg || 'Error cargando cotizaciones disponibles'
  } finally {
    loading.value = false
  }
}

watch(internal, (v) => {
  if (v) {
    selectedFolios.value = []
    name.value = ''
    fechaCierre.value = null
    notas.value = ''
    etapa.value = stageOptions[0]
    error.value = null
    loadAvailable()
  }
})

const canSubmit = computed(() => name.value && selectedFolios.value.length > 0)

const submit = async () => {
  if (!canSubmit.value) return
  saving.value = true
  error.value = null
  try {
    // Resolver SourceCompany: pasada por prop (más confiable) o la del primer folio seleccionado
    const firstSelected = availableQuotes.value.find(q => q.Folio === selectedFolios.value[0])
    const sourceCompany = props.sourceCompany || firstSelected?.SourceCompany
    const res = await axios.post('/crm/opportunities', {
      CardCode: props.cardCode,
      CustomerName: props.customerName,
      SourceCompany: sourceCompany,
      Name: name.value,
      Etapa: etapa.value,
      FechaCierre: fechaCierre.value,
      Notas: notas.value,
      Folios: selectedFolios.value
    })
    emit('created', res.data)
    internal.value = false
  } catch (e) {
    error.value = e.response?.data?.msg || 'Error creando oportunidad'
  } finally {
    saving.value = false
  }
}

const toggleFolio = (folio) => {
  selectedFolios.value = selectedFolios.value.includes(folio)
    ? selectedFolios.value.filter(f => f !== folio)
    : [...selectedFolios.value, folio]
}
</script>

<template>
  <UModal
    v-model:open="internal"
    title="Crear Oportunidad"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div class="text-xs text-muted mb-1">
        Cliente
      </div>
      <div class="text-base font-semibold text-highlighted mb-4">
        {{ customerName || cardCode }}
      </div>

      <div class="grid grid-cols-12 gap-3">
        <UFormField label="Nombre de la oportunidad" class="col-span-12 md:col-span-8">
          <UInput v-model="name" class="w-full" />
        </UFormField>
        <UFormField label="Fecha de Cierre" class="col-span-12 md:col-span-4">
          <UInput
            v-model="fechaCierre"
            type="date"
            icon="i-mdi-calendar-check"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Etapa Inicial" class="col-span-12 md:col-span-6">
          <USelect
            v-model="etapa"
            :items="stageOptions"
            icon="i-mdi-trending-up"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Notas (opcional)" class="col-span-12 md:col-span-6">
          <UInput v-model="notas" class="w-full" />
        </UFormField>
      </div>

      <USeparator class="my-4" />

      <div class="flex items-center gap-2 mb-2">
        <UIcon name="i-mdi-file-document-multiple" class="text-primary size-5" />
        <span class="font-semibold text-highlighted">Cotizaciones a Unificar</span>
        <div class="flex-1" />
        <UBadge
          v-if="selectedFolios.length > 0"
          color="primary"
          variant="subtle"
          size="sm"
        >
          {{ selectedFolios.length }} seleccionada(s) · {{ formatCurrency(totalSum) }}
        </UBadge>
      </div>

      <UAlert
        v-if="!loading && availableQuotes.length === 0"
        color="info"
        variant="subtle"
        icon="i-mdi-information-outline"
        title="No hay cotizaciones abiertas disponibles para este cliente."
        class="mb-2"
      />

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-mdi-alert-circle-outline"
        :title="error"
        class="mb-2"
      />

      <UProgress v-if="loading" />

      <div v-if="!loading && availableQuotes.length > 0" class="divide-y divide-default">
        <div
          v-for="q in availableQuotes"
          :key="q.Folio"
          class="flex items-start gap-3 py-3 cursor-pointer hover:bg-elevated/50 px-2 rounded"
          @click="toggleFolio(q.Folio)"
        >
          <UCheckbox
            :model-value="selectedFolios.includes(q.Folio)"
            class="mt-0.5"
            @click.stop
            @update:model-value="() => toggleFolio(q.Folio)"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-highlighted">#{{ q.Folio }}</span>
              <UBadge color="neutral" variant="subtle" size="sm">
                {{ q.Etapa }}
              </UBadge>
              <span class="text-sm text-muted">
                {{ formatDate(q.Fecha) }} · {{ formatCurrency(q.Monto) }}
              </span>
            </div>
            <div v-if="q.Referencia" class="text-sm text-muted mt-1 flex items-center gap-1">
              <UIcon name="i-mdi-tag-outline" class="size-4 shrink-0" />
              <span><span class="font-medium">Ref:</span> {{ q.Referencia }}</span>
            </div>
            <div v-if="q.Comentarios" class="text-sm text-muted mt-1 flex items-start gap-1 quote-comments">
              <UIcon name="i-mdi-comment-text-outline" class="size-4 shrink-0 mt-0.5" />
              <span>{{ q.Comentarios }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" @click="internal = false">
          Cancelar
        </UButton>
        <UButton
          color="primary"
          :disabled="!canSubmit"
          :loading="saving"
          @click="submit"
        >
          Crear Oportunidad
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.quote-comments {
    white-space: normal !important;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
