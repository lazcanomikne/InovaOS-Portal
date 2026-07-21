<script setup>
// Centro de Autorizaciones: aprobar, rechazar o reconsiderar solicitudes.
import { ref, computed, onMounted } from 'vue'
import axios from '~/utils/axios'

const toast = useToast()

const requests = ref([])
const filter = ref('PENDING') // PENDING, APPROVED, REJECTED
const search = ref('')
const cargando = ref(false)

const stats = computed(() => {
  return {
    pending: requests.value.filter(r => r.Status === 'PENDING').length,
    approved: requests.value.filter(r => r.Status === 'APPROVED').length,
    rejected: requests.value.filter(r => r.Status === 'REJECTED').length
  }
})

const filteredItems = computed(() => {
  let base
  if (filter.value === 'PENDING') base = requests.value.filter(r => r.Status === 'PENDING')
  else if (filter.value === 'APPROVED') base = requests.value.filter(r => r.Status === 'APPROVED')
  else base = requests.value.filter(r => r.Status === 'REJECTED')

  const q = search.value.trim().toLowerCase()
  if (!q) return base

  return base.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)))
})

const loadData = async () => {
  cargando.value = true
  try {
    const res = await axios.get('/rh/authorization/dashboard')
    requests.value = res.data
  } catch (error) {
    console.error('Error loading authorizations', error)
    // MOCK DATA Fallback
    requests.value = [
      { RequestID: 1, EmployeeName: 'Ana Gomez', JobTitle: 'Vendedora', RequestType: 'VACATION', StartDate: '2025-10-10', EndDate: '2025-10-15', DaysQuantity: 6, Reason: 'Viaje familiar', Status: 'PENDING' },
      { RequestID: 2, EmployeeName: 'Carlos Ruiz', JobTitle: 'Chofer', RequestType: 'PERMIT_5H', StartDate: '2025-10-12', EndDate: '2025-10-12', DaysQuantity: 0.5, Reason: 'Cita médica', Status: 'APPROVED' }
    ]
  } finally {
    cargando.value = false
  }
}

// --- Confirmación de acción ---
const confirmarAbierto = ref(false)
const procesando = ref(false)
const pendiente = ref({ item: null, action: null })

const accionLabel = computed(() => {
  if (pendiente.value.action === 'APPROVE') return 'AUTORIZAR'
  if (pendiente.value.action === 'REVOKE') return 'REVERTIR'
  return 'RECHAZAR'
})

const accionColor = computed(() => {
  if (pendiente.value.action === 'APPROVE') return 'success'
  if (pendiente.value.action === 'REVOKE') return 'warning'
  return 'error'
})

const confirmAction = (item, action) => {
  pendiente.value = { item, action }
  confirmarAbierto.value = true
}

const ejecutarAccion = async () => {
  const { item, action } = pendiente.value
  if (!item) return

  procesando.value = true
  try {
    await axios.post('/rh/authorization/action', { requestId: item.RequestID, action })
    confirmarAbierto.value = false
    toast.add({ title: 'Acción ejecutada correctamente', color: 'success' })
    loadData() // Recargar todo para reflejar estado real
  } catch (error) {
    console.error(error)
    toast.add({ title: 'Error al procesar acción', color: 'error' })
  } finally {
    procesando.value = false
  }
}

const getTypeColor = type => type === 'VACATION' ? 'primary' : (type === 'CASH_OUT' ? 'success' : 'info')
const getTypeLabel = type => type === 'VACATION' ? 'Vacaciones' : (type === 'CASH_OUT' ? 'Canje' : 'Permiso')
const formatDate = d => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis en lugar de
// ensanchar la tabla. Mismo criterio que el pipeline.
const headers = [
  { key: 'Employee', title: 'Empleado', w: 'w-[26%]' },
  { key: 'RequestType', title: 'Tipo', w: 'w-[12%]' },
  { key: 'fechas', title: 'Fechas Solicitadas', w: 'w-[18%]' },
  { key: 'Reason', title: 'Motivo', w: 'w-[28%]' },
  { key: 'actions', title: 'Acciones', align: 'end', w: 'w-[16%]' }
]

const columns = headers.map((hdr) => {
  const align = hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
  return {
    id: hdr.key,
    // Employee, fechas y actions se pintan por slot; no tienen campo propio.
    ...(['Employee', 'fechas', 'actions'].includes(hdr.key) ? {} : { accessorKey: hdr.key }),
    header: hdr.title,
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

// Distingue la primera carga (mostramos esqueletos) de las recargas, para que
// los contadores no parpadeen al cambiar de pestaña.
const cargaInicial = computed(() => cargando.value && !requests.value.length)

// La pestaña de estado siempre tiene un valor; el filtro removible es la búsqueda.
const hayFiltros = computed(() => !!search.value)

const limpiarFiltros = () => { search.value = '' }

const etiquetaEstado = computed(() => ({
  PENDING: 'pendientes',
  APPROVED: 'autorizadas',
  REJECTED: 'rechazadas'
}[filter.value] || ''))

onMounted(() => loadData())
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="rh-autorizaciones" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Centro de Autorizaciones">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-mdi-refresh"
            :loading="cargando"
            @click="loadData"
          >
            Actualizar
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Tarjetas de filtro: siempre visibles, no se comprimen -->
      <div class="grid grid-cols-12 gap-4 mb-4 shrink-0">
        <div class="col-span-12 md:col-span-4">
          <UCard
            class="cursor-pointer transition-colors"
            :class="filter === 'PENDING' ? 'ring-2 ring-warning bg-elevated' : ''"
            @click="filter = 'PENDING'"
          >
            <div class="flex items-center justify-between">
              <div>
                <!-- Esqueleto sólo en la primera carga: al cambiar de pestaña
                     el contador ya está y no debe parpadear. -->
                <USkeleton v-if="cargaInicial" class="h-9 w-14" />
                <h2 v-else class="text-3xl font-bold text-warning">
                  {{ stats.pending }}
                </h2>
                <span class="text-sm font-medium text-muted">Pendientes de Acción</span>
              </div>
              <UIcon name="i-mdi-clock-alert-outline" class="size-12 text-warning opacity-50" />
            </div>
          </UCard>
        </div>

        <div class="col-span-12 md:col-span-4">
          <UCard
            class="cursor-pointer transition-colors"
            :class="filter === 'APPROVED' ? 'ring-2 ring-success bg-elevated' : ''"
            @click="filter = 'APPROVED'"
          >
            <div class="flex items-center justify-between">
              <div>
                <USkeleton v-if="cargaInicial" class="h-9 w-14" />
                <h2 v-else class="text-3xl font-bold text-success">
                  {{ stats.approved }}
                </h2>
                <span class="text-sm font-medium text-muted">Autorizados</span>
              </div>
              <UIcon name="i-mdi-check-decagram" class="size-12 text-success opacity-50" />
            </div>
          </UCard>
        </div>

        <div class="col-span-12 md:col-span-4">
          <UCard
            class="cursor-pointer transition-colors"
            :class="filter === 'REJECTED' ? 'ring-2 ring-error bg-elevated' : ''"
            @click="filter = 'REJECTED'"
          >
            <div class="flex items-center justify-between">
              <div>
                <USkeleton v-if="cargaInicial" class="h-9 w-14" />
                <h2 v-else class="text-3xl font-bold text-error">
                  {{ stats.rejected }}
                </h2>
                <span class="text-sm font-medium text-muted">Rechazados</span>
              </div>
              <UIcon name="i-mdi-close-circle-outline" class="size-12 text-error opacity-50" />
            </div>
          </UCard>
        </div>
      </div>

      <!-- La tarjeta ocupa el espacio restante y es la única que scrollea por dentro. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ header: 'shrink-0', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-lg font-semibold text-highlighted">Listado de Solicitudes</span>
            <UInput
              v-model="search"
              icon="i-mdi-magnify"
              placeholder="Buscar empleado..."
              class="max-w-xs"
            />
          </div>
        </template>

        <UTable
          :data="filteredItems"
          :columns="columns"
          :loading="cargando"
          sticky="header"
          class="flex-1 min-h-0 overflow-y-auto"
          :ui="{
            base: 'table-fixed w-full',
            td: 'text-sm py-2',
            th: 'text-xs py-2'
          }"
        >
          <!-- Carga: filas fantasma en vez de un spinner suelto. Da sensación
               de rapidez porque la estructura aparece de inmediato. -->
          <template #loading>
            <div class="divide-y divide-default">
              <div
                v-for="i in 8"
                :key="`fila-skel-${i}`"
                class="flex items-center gap-4 px-2 py-3"
              >
                <USkeleton class="size-9 rounded-lg shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-32 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
              </div>
            </div>
          </template>

          <!-- Vacío: distingue "no hay nada" de "la búsqueda no deja ver nada",
               y ofrece la acción correspondiente en cada caso. -->
          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon
                  :name="hayFiltros ? 'i-lucide-filter-x' : 'i-lucide-inbox'"
                  class="size-7 text-primary"
                />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                {{ hayFiltros ? 'Ninguna solicitud coincide con la búsqueda' : 'No hay solicitudes en esta vista' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba con otro nombre o limpia la búsqueda.'
                  : `No se encontraron solicitudes ${etiquetaEstado}.` }}
              </p>

              <UButton
                v-if="hayFiltros"
                label="Limpiar búsqueda"
                icon="i-lucide-circle-x"
                color="neutral"
                variant="subtle"
                @click="limpiarFiltros"
              />
              <UButton
                v-else
                label="Recargar"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="subtle"
                @click="loadData"
              />
            </div>
          </template>

          <template #Employee-cell="{ row }">
            <div class="flex items-center gap-3 py-2 min-w-0">
              <UAvatar
                :text="row.original.EmployeeName?.charAt(0)"
                size="md"
                class="rounded-lg shrink-0"
              />
              <div class="min-w-0">
                <div class="font-bold text-highlighted truncate" :title="row.original.EmployeeName">
                  {{ row.original.EmployeeName }}
                </div>
                <div class="text-xs text-muted truncate" :title="row.original.JobTitle">
                  {{ row.original.JobTitle }}
                </div>
              </div>
            </div>
          </template>

          <template #RequestType-cell="{ row }">
            <UBadge :color="getTypeColor(row.original.RequestType)" variant="solid" class="font-bold">
              {{ getTypeLabel(row.original.RequestType) }}
            </UBadge>
          </template>

          <template #fechas-cell="{ row }">
            <div class="text-sm text-highlighted">
              {{ formatDate(row.original.StartDate) }} - {{ formatDate(row.original.EndDate) }}
              <div class="text-xs text-muted">
                ({{ row.original.DaysQuantity }} días)
              </div>
            </div>
          </template>

          <template #Reason-cell="{ row }">
            <span class="block truncate text-muted" :title="row.original.Reason">
              {{ row.original.Reason }}
            </span>
          </template>

          <template #actions-cell="{ row }">
            <div v-if="filter === 'PENDING'" class="flex gap-2 justify-end">
              <UButton
                size="sm"
                color="error"
                variant="soft"
                icon="i-mdi-close"
                square
                @click="confirmAction(row.original, 'REJECT')"
              />
              <UButton
                size="sm"
                color="success"
                icon="i-mdi-check"
                square
                @click="confirmAction(row.original, 'APPROVE')"
              />
            </div>
            <div v-else class="flex gap-2 justify-end">
              <UButton
                size="sm"
                color="warning"
                variant="ghost"
                icon="i-mdi-undo"
                @click="confirmAction(row.original, 'REVOKE')"
              >
                Reconsiderar
              </UButton>
            </div>
          </template>
        </UTable>
      </UCard>

      <UModal v-model:open="confirmarAbierto" title="Confirmar acción">
        <template #body>
          <p class="text-muted">
            ¿Estás seguro de <b class="text-highlighted">{{ accionLabel }}</b> esta solicitud
            <template v-if="pendiente.item">
              de <b class="text-highlighted">{{ pendiente.item.EmployeeName }}</b>
            </template>?
          </p>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="confirmarAbierto = false">
              Cancelar
            </UButton>
            <UButton :color="accionColor" :loading="procesando" @click="ejecutarAccion">
              Confirmar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
