<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from '~/utils/axios'
import {
  stageOptions, stageColors, motivoPerdidaOptions,
  isPerdida, requiresSeguimiento, requiresComentario
} from '~/config/crmStages'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const saving = ref(false)
const data = ref(null)

const editable = ref({
  Name: '', Etapa: '', FechaCierre: null, Notas: '',
  MotivoPerdida: null, ComentarioPerdida: '', FechaSeguimiento: null
})

const showPerdidaFields = computed(() => isPerdida(editable.value.Etapa))
const showSeguimientoField = computed(() => showPerdidaFields.value && requiresSeguimiento(editable.value.MotivoPerdida))
const showComentarioField = computed(() => showPerdidaFields.value && requiresComentario(editable.value.MotivoPerdida))

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await axios.get(`/crm/opportunities/${route.params.id}`)
    data.value = res.data
    const h = data.value.header
    editable.value = {
      Name: h.Name,
      Etapa: h.Etapa,
      FechaCierre: h.FechaCierre ? new Date(h.FechaCierre).toISOString().slice(0, 10) : null,
      Notas: h.Notas || '',
      MotivoPerdida: h.MotivoPerdida || null,
      ComentarioPerdida: h.ComentarioPerdida || '',
      FechaSeguimiento: h.FechaSeguimiento ? new Date(h.FechaSeguimiento).toISOString().slice(0, 10) : null
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, fetchDetail)

const save = async () => {
  saving.value = true
  try {
    await axios.put(`/crm/opportunities/${route.params.id}`, editable.value)
    await fetchDetail()
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}

// Confirmaciones con UModal (antes eran window.confirm)
const confirmQuoteOpen = ref(false)
const quoteToRemove = ref(null)
const confirmOppOpen = ref(false)

const askRemoveQuote = (folio) => {
  quoteToRemove.value = folio
  confirmQuoteOpen.value = true
}

const removeQuote = async () => {
  const folio = quoteToRemove.value
  confirmQuoteOpen.value = false
  if (!folio) return
  try {
    await axios.delete(`/crm/opportunities/${route.params.id}/quotes/${folio}`)
    await fetchDetail()
  } catch (e) { console.error(e) }
}

const removeOpp = async () => {
  confirmOppOpen.value = false
  try {
    await axios.delete(`/crm/opportunities/${route.params.id}`)
    router.push('/app/crm/opportunities')
  } catch (e) { console.error(e) }
}

const formatCurrency = (v, c) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: c || 'MXN' }).format(v || 0)
const formatDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—'

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el contenido largo se recorta con elipsis en lugar
// de ensanchar la tabla. Mismo criterio que el pipeline.
const quoteHeaders = [
  { key: 'Folio', title: 'Folio', w: 'w-[12%]' },
  { key: 'Fecha', title: 'Fecha', w: 'w-[14%]' },
  { key: 'Etapa', title: 'Etapa', w: 'w-[22%]' },
  { key: 'EstadoSAP', title: 'Estado SAP', w: 'w-[24%]' },
  { key: 'Monto', title: 'Monto', align: 'end', w: 'w-[20%]' },
  { key: 'actions', title: '', align: 'end', sortable: false, w: 'w-[8%]' }
]

const quoteColumns = quoteHeaders.map((hdr) => {
  const align = hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
  return {
    id: hdr.key,
    accessorKey: hdr.key,
    header: hdr.title,
    enableSorting: hdr.sortable !== false,
    meta: {
      class: {
        // El ancho se declara en el th; con `table-fixed` el td lo hereda.
        th: [hdr.w, 'px-2 truncate', align].filter(Boolean).join(' '),
        // `truncate` recorta con elipsis en vez de ensanchar la columna.
        td: ['px-2 truncate', align].filter(Boolean).join(' ')
      }
    }
  }
})

const estadoSapColor = (estado) => {
  if (estado === 'Cancelada en SAP') return 'error'
  if (estado === 'Cerrada en SAP') return 'success'
  return 'info' // Abierta
}
const estadoSapIcon = (estado) => {
  if (estado === 'Cancelada en SAP') return 'i-mdi-close-octagon'
  if (estado === 'Cerrada en SAP') return 'i-mdi-check-decagram'
  return 'i-mdi-clock-outline'
}

onMounted(fetchDetail)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="crm-opportunity-detail" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar :title="data?.header?.Name || 'Oportunidad'" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="error"
            variant="ghost"
            icon="i-mdi-delete"
            @click="confirmOppOpen = true"
          >
            Eliminar
          </UButton>
          <UButton
            color="primary"
            icon="i-mdi-content-save"
            :loading="saving"
            @click="save"
          >
            Guardar cambios
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-mdi-arrow-left"
        class="mb-2 shrink-0 self-start"
        @click="router.push('/app/crm/opportunities')"
      >
        Volver al listado
      </UButton>

      <!-- Sólo en la primera carga: al refrescar, la tabla muestra sus propias
           filas fantasma y el resto de la ficha se mantiene visible. -->
      <UProgress v-if="loading && !data" class="mb-4" />

      <template v-if="data">
        <p class="text-muted mb-4">
          {{ data.header.CustomerName }} ({{ data.header.CardCode }})
          · #{{ data.header.OpportunityID }}
        </p>

        <!-- KPIs de la oportunidad: valor = promedio de las cotizaciones -->
        <div class="grid grid-cols-12 gap-4 mb-6 shrink-0">
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Cotizaciones
              </div>
              <div class="text-2xl font-bold text-info">
                {{ data.totals.QuoteCount }}
              </div>
              <div class="text-xs text-dimmed">
                Suma: {{ formatCurrency(data.totals.SumaMonto) }}
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Valor de la Oportunidad
              </div>
              <div class="text-2xl font-bold text-primary">
                {{ formatCurrency(data.totals.ValorOportunidad) }}
              </div>
              <div class="text-xs text-dimmed">
                Promedio (suma / {{ data.totals.QuoteCount }})
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Utilidad
              </div>
              <div class="text-2xl font-bold text-success">
                {{ formatCurrency(data.totals.UtilidadOportunidad) }}
              </div>
              <div class="text-xs text-dimmed">
                Promedio
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Margen
              </div>
              <div class="text-2xl font-bold text-highlighted">
                {{ Math.ceil(data.totals.MargenOportunidad) }}%
              </div>
            </div>
          </UCard>
        </div>

        <!-- Edición de cabecera: siempre visible, no se comprime -->
        <UCard class="mb-4 shrink-0">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-mdi-tune-vertical" class="text-primary size-5" />
              <span class="font-semibold text-highlighted">Datos de la Oportunidad</span>
            </div>
          </template>

          <div class="grid grid-cols-12 gap-3">
            <UFormField label="Nombre" class="col-span-12 md:col-span-6">
              <UInput v-model="editable.Name" class="w-full" />
            </UFormField>
            <UFormField label="Etapa" class="col-span-12 md:col-span-3">
              <USelect v-model="editable.Etapa" :items="stageOptions" class="w-full" />
            </UFormField>
            <UFormField label="Fecha de Cierre" class="col-span-12 md:col-span-3">
              <UInput v-model="editable.FechaCierre" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Notas" class="col-span-12">
              <UInput v-model="editable.Notas" class="w-full" />
            </UFormField>

            <!-- Campos condicionales cuando Etapa = Perdida -->
            <template v-if="showPerdidaFields">
              <UFormField label="Motivo de pérdida" class="col-span-12 md:col-span-6">
                <USelect
                  v-model="editable.MotivoPerdida"
                  :items="motivoPerdidaOptions"
                  icon="i-mdi-alert-octagon-outline"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                v-if="showSeguimientoField"
                label="Próximo seguimiento"
                class="col-span-12 md:col-span-6"
              >
                <UInput
                  v-model="editable.FechaSeguimiento"
                  type="date"
                  icon="i-mdi-calendar-clock"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                v-if="showComentarioField"
                label="Comentario del vendedor"
                class="col-span-12"
              >
                <UTextarea
                  v-model="editable.ComentarioPerdida"
                  :rows="2"
                  autoresize
                  class="w-full"
                />
              </UFormField>
            </template>
          </div>
        </UCard>

        <!-- Cotizaciones vinculadas: ocupa el espacio restante y scrollea por dentro -->
        <UCard
          class="mb-4 flex-1 min-h-0 flex flex-col"
          :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col', header: 'shrink-0' }"
        >
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-mdi-file-document-multiple" class="text-primary size-5" />
              <span class="font-semibold text-highlighted">Cotizaciones Vinculadas</span>
            </div>
          </template>

          <UTable
            :data="data.quotes"
            :columns="quoteColumns"
            :loading="loading"
            sticky="header"
            class="flex-1 min-h-0 overflow-y-auto"
            :ui="{
              base: 'table-fixed w-full',
              td: 'text-sm py-2',
              th: 'text-xs py-2'
            }"
          >
            <!-- Carga: filas fantasma en vez de un spinner suelto. -->
            <template #loading>
              <div class="divide-y divide-default">
                <div
                  v-for="i in 8"
                  :key="`fila-skel-${i}`"
                  class="flex items-center gap-4 px-2 py-3"
                >
                  <USkeleton class="h-4 w-16 shrink-0" />
                  <USkeleton class="h-4 w-20 shrink-0" />
                  <USkeleton class="h-4 flex-1" />
                  <USkeleton class="h-4 flex-1" />
                  <USkeleton class="h-4 w-24 shrink-0" />
                </div>
              </div>
            </template>

            <!-- Vacío: esta tabla no tiene filtros, así que sólo cabe el caso de
                 "sin cotizaciones vinculadas", con la acción de recargar. -->
            <template #empty>
              <div class="py-12 px-6 text-center">
                <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                  <UIcon name="i-lucide-inbox" class="size-7 text-primary" />
                </div>

                <p class="font-semibold text-highlighted mb-1">
                  Sin cotizaciones vinculadas
                </p>
                <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                  Esta oportunidad no tiene cotizaciones asociadas. Se vinculan desde el pipeline.
                </p>

                <UButton
                  label="Recargar"
                  icon="i-lucide-refresh-cw"
                  color="neutral"
                  variant="subtle"
                  @click="fetchDetail"
                />
              </div>
            </template>

            <template #Folio-cell="{ row }">
              <span class="font-bold text-primary">#{{ row.original.Folio }}</span>
            </template>
            <template #Fecha-cell="{ row }">
              {{ formatDate(row.original.Fecha) }}
            </template>
            <template #Etapa-cell="{ row }">
              <UBadge :color="stageColors[row.original.Etapa] || 'neutral'" variant="subtle" size="sm">
                {{ row.original.Etapa }}
              </UBadge>
            </template>
            <template #EstadoSAP-cell="{ row }">
              <UBadge
                :color="estadoSapColor(row.original.EstadoSAP)"
                :icon="estadoSapIcon(row.original.EstadoSAP)"
                variant="subtle"
                size="sm"
              >
                {{ row.original.EstadoSAP }}
              </UBadge>
            </template>
            <template #Monto-cell="{ row }">
              <span
                class="font-semibold"
                :class="{ 'text-dimmed line-through': row.original.DocStatus !== 'O' }"
              >
                {{ formatCurrency(row.original.Monto, row.original.Moneda) }}
              </span>
            </template>
            <template #actions-cell="{ row }">
              <UButton
                icon="i-mdi-link-off"
                size="xs"
                variant="ghost"
                color="error"
                @click="askRemoveQuote(row.original.Folio)"
              />
            </template>
          </UTable>

          <div
            v-if="data.totals.QuoteCount !== data.totals.QuoteCountTotal"
            class="px-4 pb-3 pt-3 text-xs text-muted flex items-start gap-1 shrink-0"
          >
            <UIcon name="i-mdi-information-outline" class="size-4 shrink-0" />
            <span>
              Los totales y productos consolidados solo consideran las cotizaciones activas en SAP
              ({{ data.totals.QuoteCount }} de {{ data.totals.QuoteCountTotal }}).
            </span>
          </div>
        </UCard>
      </template>

      <!-- Confirmación: quitar cotización -->
      <UModal
        v-model:open="confirmQuoteOpen"
        title="Quitar cotización"
        :description="`¿Quitar la cotización #${quoteToRemove} de la oportunidad?`"
      >
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="confirmQuoteOpen = false">
              Cancelar
            </UButton>
            <UButton color="error" @click="removeQuote">
              Quitar
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Confirmación: eliminar oportunidad -->
      <UModal
        v-model:open="confirmOppOpen"
        title="Eliminar oportunidad"
        description="¿Eliminar la oportunidad? Las cotizaciones quedarán liberadas."
      >
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="confirmOppOpen = false">
              Cancelar
            </UButton>
            <UButton color="error" @click="removeOpp">
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
