<script setup>
// Calendario de Ausencias: rejilla mensual + detalle del día seleccionado.
import { ref, computed, onMounted } from 'vue'
import axios from '~/utils/axios'
import { aFechaLocal } from '~/utils/fechas'

const today = new Date()
const currentMonth = ref(today.getMonth())
const currentYear = ref(today.getFullYear())
const selectedDate = ref(new Date())
const events = ref([])
const cargando = ref(false)

const diasSemana = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']

const loadEvents = async () => {
  cargando.value = true
  try {
    const res = await axios.get('/rh/calendar-events')
    events.value = res.data
  } catch (e) {
    console.error(e)
  } finally {
    cargando.value = false
  }
}

const currentMonthName = computed(() => {
  return new Date(currentYear.value, currentMonth.value).toLocaleString('es-MX', { month: 'long' })
})

const daysInMonth = computed(() => new Date(currentYear.value, currentMonth.value + 1, 0).getDate())
const blankDays = computed(() => new Date(currentYear.value, currentMonth.value, 1).getDay())

const changeMonth = (step) => {
  const newMonth = currentMonth.value + step
  if (newMonth > 11) {
    currentMonth.value = 0
    currentYear.value++
  } else if (newMonth < 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value = newMonth
  }
}

const selectDate = (day) => {
  selectedDate.value = new Date(currentYear.value, currentMonth.value, day)
}

const getEventsForDay = (day) => {
  const checkDate = new Date(currentYear.value, currentMonth.value, day)
  checkDate.setHours(0, 0, 0, 0)
  return events.value.filter((e) => {
    // Fechas DATE: se arman en hora local (aFechaLocal), igual que checkDate.
    // Con new Date() crudo se interpretaban como medianoche UTC y en Mexico
    // (UTC-6) la solicitud caia un dia antes en el calendario: una del 24
    // aparecia bajo el 23. aFechaLocal toma solo YYYY-MM-DD sin corrimiento.
    const start = aFechaLocal(e.StartDate)
    const end = aFechaLocal(e.EndDate)
    if (!start || !end) return false
    return checkDate >= start && checkDate <= end
  })
}

const selectedDayEvents = computed(() => getEventsForDay(selectedDate.value.getDate()))

const isSelected = (day) => {
  const d = new Date(currentYear.value, currentMonth.value, day)
  return d.toDateString() === selectedDate.value.toDateString()
}

const isToday = (day) => {
  const d = new Date(currentYear.value, currentMonth.value, day)
  return d.toDateString() === new Date().toDateString()
}

// Colores por tipo de solicitud (equivalentes semánticos del tema)
const getEventColor = (type) => {
  if (type === 'VACATION') return 'primary'
  if (type && type.includes('PERMIT')) return 'success'
  return 'warning'
}

const getTypeLabel = (type) => {
  if (type === 'VACATION') return 'Vacaciones'
  if (type && type.includes('PERMIT')) return 'Permiso'
  return 'Canje'
}

const formatDateLong = (date) => {
  return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// Las fechas de vacaciones son columnas DATE, sin hora. Se arman en hora local
// desde el texto: pasarlas por `new Date()` las interpreta como medianoche UTC
// y en Mexico (UTC-6) se mostraban un dia antes de la que esta guardada.
const formatDateShort = (d) => {
  const f = aFechaLocal(d)
  return f ? f.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', '') : '-'
}

// `w` es el peso de la columna en porcentaje. La tabla de detalle usa
// `table-fixed`, así que estos anchos mandan y el texto largo se recorta con
// elipsis en lugar de ensanchar la tabla. (La rejilla del mes no se toca.)
const detalleHeaders = [
  { key: 'FullName', title: 'Empleado', w: 'w-[26%]' },
  { key: 'Department', title: 'Departamento', w: 'w-[16%]' },
  { key: 'RequestType', title: 'Tipo', w: 'w-[13%]' },
  { key: 'Duration', title: 'Periodo Completo', w: 'w-[23%]' },
  { key: 'Reason', title: 'Motivo', w: 'w-[22%]' }
]

const columns = detalleHeaders.map(hdr => ({
  id: hdr.key,
  // `Duration` se pinta por slot combinando dos fechas; no tiene campo propio.
  ...(hdr.key === 'Duration' ? {} : { accessorKey: hdr.key }),
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

const mostrarDetalle = computed(() =>
  selectedDayEvents.value.length > 0 || isSelected(selectedDate.value.getDate())
)

onMounted(() => loadEvents())
</script>

<template>
  <UDashboardPanel id="rh-calendario-ausencias">
    <template #header>
      <UDashboardNavbar title="Calendario de Ausencias">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-mdi-chevron-left"
              square
              @click="changeMonth(-1)"
            />
            <span class="text-sm font-semibold capitalize text-highlighted min-w-40 text-center">
              {{ currentMonthName }} <span class="text-primary">{{ currentYear }}</span>
            </span>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-mdi-chevron-right"
              square
              @click="changeMonth(1)"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="text-xl font-bold capitalize text-highlighted">
              {{ currentMonthName }} <span class="text-primary">{{ currentYear }}</span>
            </h2>

            <div class="hidden md:flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="size-2.5 rounded-full bg-primary" />
                <span class="text-xs font-bold text-muted">Vacaciones</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="size-2.5 rounded-full bg-success" />
                <span class="text-xs font-bold text-muted">Permisos</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="size-2.5 rounded-full bg-warning" />
                <span class="text-xs font-bold text-muted">Canjes</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Cabecera de días -->
        <div class="grid grid-cols-7 py-3 bg-elevated border-b border-default">
          <div
            v-for="day in diasSemana"
            :key="day"
            class="text-center font-bold text-xs text-muted"
          >
            {{ day }}
          </div>
        </div>

        <!-- Rejilla del mes -->
        <div class="grid grid-cols-7 gap-px bg-accented">
          <div
            v-for="blank in blankDays"
            :key="'blank-' + blank"
            class="min-h-30 bg-elevated/50"
          />

          <div
            v-for="day in daysInMonth"
            :key="day"
            class="min-h-30 p-2 bg-default cursor-pointer transition-colors hover:bg-elevated relative"
            :class="isSelected(day) ? 'bg-elevated ring-2 ring-inset ring-primary' : ''"
            @click="selectDate(day)"
          >
            <div class="flex justify-between items-start mb-1">
              <div
                class="text-xs font-bold flex items-center justify-center size-6.5 rounded-full"
                :class="isToday(day) ? 'bg-primary text-inverted' : 'text-muted'"
              >
                {{ day }}
              </div>
              <UIcon
                v-if="getEventsForDay(day).length > 3"
                name="i-mdi-dots-horizontal"
                class="size-3.5 text-muted"
              />
            </div>

            <div class="flex flex-col gap-0.5">
              <UBadge
                v-for="(event, i) in getEventsForDay(day).slice(0, 3)"
                :key="i"
                size="sm"
                :color="getEventColor(event.RequestType)"
                variant="solid"
                class="w-full justify-start px-2 rounded"
              >
                <span class="truncate font-bold text-[10px]">
                  {{ event.FullName.split(' ')[0] }}
                </span>
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Detalle del día -->
      <UCard
        v-if="mostrarDetalle"
        class="mt-4 border-t-4 border-t-primary"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <template #header>
          <div class="flex justify-between items-center">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <UIcon name="i-mdi-calendar-blank" class="size-4 text-primary" />
                <span class="text-xs font-bold uppercase tracking-wide text-primary">
                  Detalle del día
                </span>
              </div>
              <h3 class="text-2xl font-bold capitalize text-highlighted">
                {{ formatDateLong(selectedDate) }}
              </h3>
            </div>

            <div class="text-right hidden sm:block">
              <div class="text-3xl font-black text-primary">
                {{ selectedDayEvents.length }}
              </div>
              <div class="text-xs font-bold text-muted uppercase">
                Ausencias
              </div>
            </div>
          </div>
        </template>

        <UTable
          :data="selectedDayEvents"
          :columns="columns"
          :loading="cargando"
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
                <USkeleton class="size-9 rounded-full shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-32 shrink-0" />
              </div>
            </div>
          </template>

          <!-- Vacío: el detalle del día no tiene filtros, así que sólo cabe el
               caso de "sin ausencias", con la acción de recargar. -->
          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon name="i-lucide-calendar-check" class="size-7 text-primary" />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                Sin ausencias este día
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                No hay vacaciones, permisos ni canjes programados para la fecha seleccionada.
              </p>

              <UButton
                label="Recargar"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="subtle"
                @click="loadEvents"
              />
            </div>
          </template>

          <template #FullName-cell="{ row }">
            <div class="flex items-center gap-3 py-2 min-w-0">
              <UAvatar :text="row.original.FullName?.charAt(0)" size="md" class="shrink-0" />
              <div class="min-w-0">
                <div class="font-bold text-sm text-highlighted truncate" :title="row.original.FullName">
                  {{ row.original.FullName }}
                </div>
                <div class="text-xs text-muted truncate" :title="row.original.JobTitle">
                  {{ row.original.JobTitle }}
                </div>
              </div>
            </div>
          </template>

          <template #RequestType-cell="{ row }">
            <UBadge
              :color="getEventColor(row.original.RequestType)"
              variant="solid"
              class="font-bold px-3"
            >
              {{ getTypeLabel(row.original.RequestType) }}
            </UBadge>
          </template>

          <template #Duration-cell="{ row }">
            <div class="text-sm text-muted">
              Del <b class="text-highlighted">{{ formatDateShort(row.original.StartDate) }}</b>
              al <b class="text-highlighted">{{ formatDateShort(row.original.EndDate) }}</b>
            </div>
          </template>

          <template #Department-cell="{ row }">
            <span class="block truncate" :title="row.original.Department">
              {{ row.original.Department }}
            </span>
          </template>

          <template #Reason-cell="{ row }">
            <span class="block truncate text-xs text-muted" :title="row.original.Reason">
              {{ row.original.Reason }}
            </span>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
