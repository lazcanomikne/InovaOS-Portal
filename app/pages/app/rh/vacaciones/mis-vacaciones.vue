<script setup>
// Mis Vacaciones: saldos del empleado, alta de solicitudes e historial.
import { ref, computed, onMounted } from 'vue'
import axios from '~/utils/axios'
import { useAuthStore } from '~/stores/auth'

const toast = useToast()

const showNotify = (message, type = 'success') => {
  toast.add({
    title: message,
    color: type === 'success' ? 'success' : 'error',
    icon: type === 'success' ? 'i-mdi-check-circle' : 'i-mdi-alert-circle'
  })
}

const employee = ref({})
const history = ref([])
const sending = ref(false)
const cargando = ref(false)

const dialog = ref({
  show: false,
  type: 'VACATION'
})

const form = ref({
  startDate: null,
  endDate: null,
  reason: '',
  subType: 'PERMIT_DAY'
})

const errores = ref({ startDate: '', reason: '' })

const validar = () => {
  errores.value = {
    startDate: form.value.startDate ? '' : 'Requerido',
    reason: form.value.reason ? '' : 'Requerido'
  }
  return !errores.value.startDate && !errores.value.reason
}

const loadData = async () => {
  cargando.value = true
  try {
    const res = await axios.get('/rh/my-vacations')
    if (res.data.stats) employee.value = res.data.stats
    if (res.data.history) history.value = res.data.history
  } catch (e) {
    console.error(e)
  } finally {
    cargando.value = false
  }
}

const submitRequest = async () => {
  if (!validar()) return

  sending.value = true
  try {
    const payload = {
      type: dialog.value.type === 'PERMIT' ? form.value.subType : dialog.value.type,
      startDate: form.value.startDate,
      endDate: form.value.endDate || form.value.startDate,
      reason: form.value.reason
    }

    await axios.post('/rh/request-time-off', payload)

    showNotify('Solicitud enviada y notificada con éxito', 'success')

    dialog.value.show = false
    loadData()
  } catch (e) {
    console.error(e)
    showNotify('Error al procesar la solicitud', 'error')
  } finally {
    sending.value = false
  }
}

const openRequestDialog = (type) => {
  dialog.value.type = type
  form.value = { startDate: null, endDate: null, reason: '', subType: 'PERMIT_DAY' }
  errores.value = { startDate: '', reason: '' }
  dialog.value.show = true
}

const getDialogTitle = () => {
  if (dialog.value.type === 'VACATION') return 'Solicitar Vacaciones'
  if (dialog.value.type === 'PERMIT') return 'Solicitar Permiso'
  return 'Canjear Días'
}

const getDialogIcon = () => {
  if (dialog.value.type === 'VACATION') return 'i-mdi-palm-tree'
  if (dialog.value.type === 'PERMIT') return 'i-mdi-clock'
  return 'i-mdi-cash'
}

const formatDuration = (item) => {
  if (item.RequestType === 'PERMIT_3H') return '3 Horas'
  if (item.RequestType === 'PERMIT_5H') return '5 Horas'

  if (item.DaysQuantity === 1) return '1 Día'
  if (item.DaysQuantity < 1 && item.DaysQuantity > 0) return 'Medio Día'
  return `${item.DaysQuantity} Días`
}

const getTypeColor = (type) => {
  if (type === 'VACATION') return 'primary'
  if (type === 'CASH_OUT') return 'warning'
  if (type && type.includes('PERMIT')) return 'success'
  return 'neutral'
}
const getTypeLabel = (type) => {
  if (type === 'VACATION') return 'Vacaciones'
  if (type === 'CASH_OUT') return 'Canje Efectivo'
  if (type && type.includes('PERMIT')) return 'Permiso'
  return type
}
const getStatusColor = (status) => {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'error'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}
const getStatusLabel = (status) => {
  if (status === 'APPROVED') return 'Autorizado'
  if (status === 'REJECTED') return 'Rechazado'
  if (status === 'PENDING') return 'Pendiente'
  return status
}
const getStatusIcon = (status) => {
  if (status === 'APPROVED') return 'i-mdi-check-circle'
  if (status === 'REJECTED') return 'i-mdi-close-circle'
  if (status === 'PENDING') return 'i-mdi-clock-outline'
  return 'i-mdi-minus-circle'
}
const formatDateShort = (d) => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
const formatDate = (d) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
}

// La foto NO viene del perfil de vacaciones: ese procedimiento consulta la tabla
// Employees (antigüedad y saldos) y el avatar vive en Users. Como esta pantalla
// siempre muestra al usuario en sesión, se toma directamente del store de
// autenticación, sin tocar el backend ni añadir otra consulta.
const authStore = useAuthStore()

const fotoUsuario = computed(() => authStore.user?.avatar || undefined)

const iniciales = computed(() => {
  const nombre = employee.value.FullName || authStore.user?.name || ''
  // Iniciales de nombre y apellido, no sólo la primera letra.
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p.charAt(0))
    .join('')
    .toUpperCase()
})

// Columnas de la tabla de historial (TanStack).
// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis.
const historialHeaders = [
  { key: 'RequestType', title: 'Tipo', w: 'w-[22%]' },
  { key: 'fechas', title: 'Fechas', w: 'w-[30%]' },
  { key: 'DaysQuantity', title: 'Duración (Días/Hrs)', w: 'w-[24%]' },
  { key: 'Status', title: 'Estado', w: 'w-[24%]' }
]

const columns = historialHeaders.map(hdr => ({
  id: hdr.key,
  // `fechas` se pinta por slot combinando dos campos; no tiene campo propio.
  ...(hdr.key === 'fechas' ? {} : { accessorKey: hdr.key }),
  header: hdr.title,
  meta: {
    class: {
      // El ancho se declara en el th; con `table-fixed` el td lo hereda.
      th: `${hdr.w} px-2`,
      // `truncate` recorta con elipsis en vez de ensanchar la columna.
      td: 'px-2 truncate'
    }
  }
}))

// Esqueletos de los saldos sólo mientras no hay ficha del empleado: al refrescar
// los datos ya están y no deben parpadear.
const cargaInicial = computed(() => cargando.value && !employee.value.FullName)

const permisoOpciones = [
  { value: 'PERMIT_3H', label: '3 Horas' },
  { value: 'PERMIT_5H', label: '5 Horas' },
  { value: 'PERMIT_DAY', label: 'Día Completo' }
]

onMounted(() => loadData())
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="rh-mis-vacaciones" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Mis Vacaciones">
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
      <div class="grid grid-cols-12 gap-4 flex-1 min-h-0">
        <!-- Ficha del empleado: scrollea por dentro si no cabe, sin empujar la página -->
        <div class="col-span-12 md:col-span-4 lg:col-span-3 min-h-0">
          <UCard class="h-full" :ui="{ body: 'overflow-y-auto' }">
            <div class="flex flex-col items-center text-center">
              <UAvatar
                size="3xl"
                :src="fotoUsuario"
                :text="iniciales"
                :alt="employee.FullName"
                class="ring-4 ring-primary/20"
              />

              <h3 class="text-xl font-bold text-highlighted mt-4 truncate max-w-full">
                {{ employee.FullName || 'Cargando...' }}
              </h3>

              <span class="text-sm text-muted font-medium mt-1">
                {{ employee.JobTitle }}
              </span>

              <UBadge
                v-if="employee.Department"
                color="primary"
                variant="solid"
                class="mt-2"
              >
                {{ employee.Department }}
              </UBadge>
            </div>

            <USeparator class="my-6" />

            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center size-12 rounded-lg bg-primary/10 shrink-0">
                  <UIcon name="i-mdi-calendar-check" class="size-6 text-primary" />
                </div>
                <div>
                  <div class="text-xs uppercase font-bold text-dimmed">
                    Fecha de Ingreso
                  </div>
                  <div class="text-sm font-bold text-highlighted mt-0.5">
                    {{ formatDate(employee.EntryDate) }}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center size-12 rounded-lg bg-success/10 shrink-0">
                  <UIcon name="i-mdi-medal-outline" class="size-6 text-success" />
                </div>
                <div>
                  <div class="text-xs uppercase font-bold text-dimmed">
                    Antigüedad
                  </div>
                  <div class="text-sm font-bold text-highlighted mt-0.5">
                    {{ employee.YearsOfService }} Años
                  </div>
                  <div class="text-xs text-muted">
                    ({{ employee.SeniorityMonths || 0 }} meses totales)
                  </div>
                </div>
              </div>
            </div>

            <UAlert
              v-if="employee.BalancePreviousPeriod > 0"
              color="warning"
              variant="subtle"
              icon="i-mdi-alert-circle-outline"
              class="mt-6"
            >
              <template #description>
                Tienes <b>{{ employee.BalancePreviousPeriod }} días</b> pendientes del periodo anterior.
              </template>
            </UAlert>
          </UCard>
        </div>

        <div class="col-span-12 md:col-span-8 lg:col-span-9 flex flex-col gap-4 min-h-0">
          <!-- Saldos: franja fija, no se comprime -->
          <div class="grid grid-cols-12 gap-4 shrink-0">
            <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al refrescar -->
            <div
              v-for="i in (cargaInicial ? 4 : 0)"
              :key="`saldo-skel-${i}`"
              class="col-span-12 sm:col-span-6 md:col-span-3"
            >
              <UCard class="h-full border-l-4 border-l-default">
                <div class="flex flex-col items-center justify-center text-center">
                  <USkeleton class="size-8 rounded-full mb-2" />
                  <USkeleton class="h-8 w-12" />
                  <USkeleton class="h-3 w-20 mt-2" />
                  <USkeleton class="h-3 w-16 mt-1" />
                </div>
              </UCard>
            </div>

            <div v-if="!cargaInicial" class="col-span-12 sm:col-span-6 md:col-span-3">
              <UCard class="h-full border-l-4 border-l-success">
                <div class="flex flex-col items-center justify-center text-center">
                  <UIcon name="i-mdi-beach" class="size-8 text-success mb-2" />
                  <div class="text-3xl font-bold text-highlighted">
                    {{ employee.BalanceCurrentPeriod }}
                  </div>
                  <div class="text-xs font-bold uppercase mt-1 text-muted">
                    Disponibles
                  </div>
                  <div class="text-xs text-dimmed">
                    Periodo Actual
                  </div>
                </div>
              </UCard>
            </div>

            <div v-if="!cargaInicial" class="col-span-12 sm:col-span-6 md:col-span-3">
              <UCard class="h-full border-l-4 border-l-info">
                <div class="flex flex-col items-center justify-center text-center">
                  <UIcon name="i-mdi-calendar-check" class="size-8 text-info mb-2" />
                  <div class="text-3xl font-bold text-highlighted">
                    {{ employee.DaysUsed }}
                  </div>
                  <div class="text-xs font-bold uppercase mt-1 text-muted">
                    Disfrutados
                  </div>
                  <div class="text-xs text-dimmed">
                    Histórico
                  </div>
                </div>
              </UCard>
            </div>

            <div v-if="!cargaInicial" class="col-span-12 sm:col-span-6 md:col-span-3">
              <UCard class="h-full border-l-4 border-l-primary">
                <div class="flex flex-col items-center justify-center text-center">
                  <UIcon name="i-mdi-calendar-clock" class="size-8 text-primary mb-2" />
                  <div class="text-3xl font-bold text-highlighted">
                    {{ employee.DaysScheduled || 0 }}
                  </div>
                  <div class="text-xs font-bold uppercase mt-1 text-muted">
                    Por Disfrutar
                  </div>
                  <div class="text-xs text-dimmed">
                    Futuros
                  </div>
                </div>
              </UCard>
            </div>

            <div v-if="!cargaInicial" class="col-span-12 sm:col-span-6 md:col-span-3">
              <UCard class="h-full border-l-4 border-l-warning">
                <div class="flex flex-col items-center justify-center text-center">
                  <UIcon name="i-mdi-history" class="size-8 text-warning mb-2" />
                  <div class="text-3xl font-bold text-highlighted">
                    {{ employee.BalancePreviousPeriod }}
                  </div>
                  <div class="text-xs font-bold uppercase mt-1 text-muted">
                    Pendientes
                  </div>
                  <div class="text-xs text-dimmed">
                    Periodo Anterior
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Acciones: franja fija, no se comprime -->
          <UCard class="shrink-0">
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 sm:col-span-4">
                <UButton
                  block
                  size="xl"
                  color="primary"
                  icon="i-mdi-palm-tree"
                  class="h-16"
                  @click="openRequestDialog('VACATION')"
                >
                  <div class="flex flex-col items-start text-left">
                    <span class="font-bold">Solicitar Vacaciones</span>
                    <span class="text-xs opacity-80 font-light">Días completos</span>
                  </div>
                </UButton>
              </div>

              <div class="col-span-12 sm:col-span-4">
                <UButton
                  block
                  size="xl"
                  color="success"
                  icon="i-mdi-clock-outline"
                  class="h-16"
                  @click="openRequestDialog('PERMIT')"
                >
                  <div class="flex flex-col items-start text-left">
                    <span class="font-bold">Solicitar Permiso</span>
                    <span class="text-xs opacity-80 font-light">Por horas o día</span>
                  </div>
                </UButton>
              </div>

              <div class="col-span-12 sm:col-span-4">
                <UButton
                  block
                  size="xl"
                  color="warning"
                  variant="soft"
                  icon="i-mdi-cash-multiple"
                  class="h-16"
                  @click="openRequestDialog('CASH_OUT')"
                >
                  <div class="flex flex-col items-start text-left">
                    <span class="font-bold">Canjear Días</span>
                    <span class="text-xs opacity-80 font-light">Pago en efectivo</span>
                  </div>
                </UButton>
              </div>
            </div>
          </UCard>

          <!-- Historial: ocupa el espacio restante y es lo único que scrollea -->
          <UCard
            class="flex-1 min-h-0 flex flex-col"
            :ui="{ header: 'shrink-0', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <h4 class="text-lg font-semibold text-highlighted">
                  Historial de Solicitudes
                </h4>
                <UBadge color="neutral" variant="subtle">
                  Total: {{ history.length }}
                </UBadge>
              </div>
            </template>

            <UTable
              :data="history"
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
              <!-- Carga: filas fantasma en vez de un spinner suelto. -->
              <template #loading>
                <div class="divide-y divide-default">
                  <div
                    v-for="i in 8"
                    :key="`fila-skel-${i}`"
                    class="flex items-center gap-4 px-2 py-3"
                  >
                    <USkeleton class="h-4 w-24 shrink-0" />
                    <USkeleton class="h-4 flex-1" />
                    <USkeleton class="h-4 w-24 shrink-0" />
                    <USkeleton class="h-4 w-28 shrink-0" />
                  </div>
                </div>
              </template>

              <!-- Vacío: el historial no tiene filtros, así que sólo cabe el caso
                   de "sin solicitudes", con la acción de recargar. -->
              <template #empty>
                <div class="py-12 px-6 text-center">
                  <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                    <UIcon name="i-lucide-inbox" class="size-7 text-primary" />
                  </div>

                  <p class="font-semibold text-highlighted mb-1">
                    Aún no has hecho solicitudes
                  </p>
                  <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                    Cuando solicites vacaciones, un permiso o un canje, aparecerán aquí con su estado.
                  </p>

                  <UButton
                    label="Recargar"
                    icon="i-lucide-refresh-cw"
                    color="neutral"
                    variant="subtle"
                    @click="loadData"
                  />
                </div>
              </template>

              <template #RequestType-cell="{ row }">
                <UBadge
                  :color="getTypeColor(row.original.RequestType)"
                  variant="solid"
                  class="font-bold"
                >
                  {{ getTypeLabel(row.original.RequestType) }}
                </UBadge>
              </template>

              <template #fechas-cell="{ row }">
                <div class="text-sm font-bold text-highlighted">
                  {{ formatDateShort(row.original.StartDate) }}
                  <span
                    v-if="row.original.StartDate !== row.original.EndDate"
                    class="font-medium text-muted"
                  >
                    - {{ formatDateShort(row.original.EndDate) }}
                  </span>
                </div>
              </template>

              <template #DaysQuantity-cell="{ row }">
                <div class="text-sm font-medium text-muted">
                  {{ formatDuration(row.original) }}
                </div>
              </template>

              <template #Status-cell="{ row }">
                <UBadge
                  :color="getStatusColor(row.original.Status)"
                  variant="subtle"
                  :icon="getStatusIcon(row.original.Status)"
                  class="font-bold"
                >
                  {{ getStatusLabel(row.original.Status) }}
                </UBadge>
              </template>
            </UTable>
          </UCard>
        </div>
      </div>

      <!-- Modal de solicitud -->
      <UModal
        v-model:open="dialog.show"
        :title="getDialogTitle()"
        :icon="getDialogIcon()"
        :dismissible="false"
      >
        <template #body>
          <div class="flex flex-col gap-4">
            <div v-if="dialog.type === 'PERMIT'">
              <label class="text-sm font-semibold mb-2 block text-highlighted">
                Duración del Permiso
              </label>
              <div class="flex gap-2">
                <UButton
                  v-for="opt in permisoOpciones"
                  :key="opt.value"
                  class="flex-1 justify-center"
                  :color="form.subType === opt.value ? 'primary' : 'neutral'"
                  :variant="form.subType === opt.value ? 'solid' : 'outline'"
                  @click="form.subType = opt.value"
                >
                  {{ opt.label }}
                </UButton>
              </div>
            </div>

            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-6">
                <UFormField label="Desde" :error="errores.startDate">
                  <UInput v-model="form.startDate" type="date" class="w-full" />
                </UFormField>
              </div>

              <div class="col-span-6">
                <UFormField label="Hasta">
                  <UInput
                    v-model="form.endDate"
                    type="date"
                    class="w-full"
                    :disabled="dialog.type === 'PERMIT'"
                  />
                </UFormField>
              </div>
            </div>

            <UFormField label="Motivo" :error="errores.reason">
              <UTextarea v-model="form.reason" :rows="3" class="w-full" />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="dialog.show = false"
            >
              Cancelar
            </UButton>
            <UButton
              color="primary"
              :loading="sending"
              @click="submitRequest"
            >
              Enviar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
