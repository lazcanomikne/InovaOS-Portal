<script setup>
// Calendario de Equipo: rejilla mensual con las ausencias del equipo.
import { ref, computed } from 'vue'
import { aFechaLocal } from '~/utils/fechas'

const today = new Date()
const currentMonth = ref(today.getMonth())
const currentYear = ref(today.getFullYear())

const diasSemana = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']

// Mock Data (Debería venir de API)
const events = ref([
  { id: 1, employee: 'Juan Pérez', start: '2025-10-10', end: '2025-10-15', color: 'primary' },
  { id: 2, employee: 'Ana López', start: '2025-10-12', end: '2025-10-12', color: 'secondary' }
])

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

const getEventsForDay = (day) => {
  const checkDate = new Date(currentYear.value, currentMonth.value, day)
  return events.value.filter((e) => {
    // Fechas DATE en hora local (aFechaLocal), sin corrimiento por UTC, para
    // que la ausencia caiga en el dia correcto del calendario.
    const start = aFechaLocal(e.start)
    const end = aFechaLocal(e.end)
    if (!start || !end) return false
    checkDate.setHours(0, 0, 0, 0)
    return checkDate >= start && checkDate <= end
  })
}

const isToday = (day) => {
  const d = new Date(currentYear.value, currentMonth.value, day)
  return d.toDateString() === new Date().toDateString()
}

// 'primary' / 'secondary' del mock -> colores semánticos de Nuxt UI
const getEventColor = (color) => {
  if (color === 'primary') return 'primary'
  if (color === 'secondary') return 'info'
  return 'neutral'
}
</script>

<template>
  <UDashboardPanel id="rh-calendario-equipo">
    <template #header>
      <UDashboardNavbar title="Calendario de Equipo">
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
            <span class="text-sm font-semibold uppercase text-highlighted min-w-40 text-center">
              {{ currentMonthName }} {{ currentYear }}
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
          <h2 class="text-xl font-bold uppercase text-highlighted text-center">
            {{ currentMonthName }} {{ currentYear }}
          </h2>
        </template>

        <!-- Cabecera de días -->
        <div class="grid grid-cols-7 bg-elevated border-b border-default">
          <div
            v-for="day in diasSemana"
            :key="day"
            class="text-center text-xs font-bold py-2 text-muted"
          >
            {{ day }}
          </div>
        </div>

        <!-- Rejilla del mes -->
        <div class="grid grid-cols-7 gap-px bg-default">
          <div
            v-for="blank in blankDays"
            :key="'blank-' + blank"
            class="min-h-25 bg-elevated/50"
          />

          <div
            v-for="day in daysInMonth"
            :key="day"
            class="min-h-25 p-1 bg-default hover:bg-elevated transition-colors"
          >
            <div class="text-right text-xs font-bold mr-1">
              <span
                :class="isToday(day)
                  ? 'inline-flex items-center justify-center size-6 rounded-full bg-primary text-inverted'
                  : 'text-muted'"
              >
                {{ day }}
              </span>
            </div>

            <div class="flex flex-col gap-0.5 mt-1">
              <UBadge
                v-for="event in getEventsForDay(day)"
                :key="event.id"
                size="sm"
                :color="getEventColor(event.color)"
                variant="solid"
                class="w-full justify-start px-1 truncate"
              >
                <span class="truncate">{{ event.employee }}</span>
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
