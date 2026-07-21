<script setup>
// InovaOS — Tablero. Portado de views/inovaos/InovaTablero.vue (Vuetify 3).
import { useInovaosStore } from '~/stores/inovaos'
import { SEMAFORO_TABLERO, ST_HEX } from '~/utils/inova-helpers'
import InovaTabs from '~/components/inovaos/InovaTabs.vue'
import InovaAcceso from '~/components/inovaos/InovaAcceso.vue'

const store = useInovaosStore()
const total = computed(() => SEMAFORO_TABLERO.reduce((a, s) => a + (store.resumen.semaforo[s.key] || 0), 0))

const segmentos = computed(() => {
  const t = total.value || 1
  let acc = 0
  return SEMAFORO_TABLERO
    .map(s => ({ ...s, n: store.resumen.semaforo[s.key] || 0 }))
    .filter(s => s.n > 0)
    .map((s) => {
      const pct = (s.n / t) * 100
      const offset = 25 - acc
      acc += pct
      return { pct, offset, color: ST_HEX[s.key] }
    })
})

const cargar = () => store.fetchResumen()
</script>

<template>
  <UDashboardPanel id="inovaos-tablero">
    <template #header>
      <UDashboardNavbar title="Tablero">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton color="primary" icon="i-mdi-plus" to="/app/inovaos/crear">
            Nuevo
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <InovaTabs />

      <InovaAcceso @listo="cargar">
        <div class="mx-auto w-full max-w-3xl">
          <div class="mb-5 flex items-center gap-2">
            <UIcon name="i-mdi-chart-donut" class="size-6 text-primary" />
            <div>
              <h1 class="text-xl font-bold text-highlighted">
                Tablero
              </h1>
              <p class="text-sm text-muted">
                Distribución de tus pendientes por estado de vencimiento.
              </p>
            </div>
          </div>

          <div v-if="store.loadingResumen" class="py-16 text-center">
            <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
          </div>

          <div v-else class="rounded-2xl border border-default bg-default p-5">
            <div class="grid grid-cols-12 items-center gap-4">
              <div class="col-span-12 text-center sm:col-span-5">
                <svg viewBox="0 0 42 42" class="dona">
                  <circle
                    class="dona-bg"
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="transparent"
                    stroke-width="4.2"
                  />
                  <circle
                    v-for="(seg, i) in segmentos"
                    :key="i"
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="transparent"
                    stroke-width="4.2"
                    :stroke="seg.color"
                    :stroke-dasharray="`${seg.pct} ${100 - seg.pct}`"
                    :stroke-dashoffset="seg.offset"
                    stroke-linecap="round"
                  />
                  <text
                    x="21"
                    y="20"
                    text-anchor="middle"
                    class="dona-total"
                  >{{ total }}</text>
                  <text
                    x="21"
                    y="26.5"
                    text-anchor="middle"
                    class="dona-sub"
                  >pendientes</text>
                </svg>
              </div>

              <div class="col-span-12 sm:col-span-7">
                <div
                  v-for="s in SEMAFORO_TABLERO"
                  :key="s.key"
                  class="mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                  :style="{ background: (store.resumen.semaforo[s.key] ? ST_HEX[s.key] + '10' : 'transparent') }"
                >
                  <span
                    class="size-3 shrink-0 rounded-full"
                    :style="{ background: ST_HEX[s.key] }"
                  />
                  <span class="flex-1 text-sm text-default">{{ s.label }}</span>
                  <span
                    class="text-lg font-extrabold"
                    :style="{ color: (store.resumen.semaforo[s.key] ? ST_HEX[s.key] : 'inherit') }"
                  >{{ store.resumen.semaforo[s.key] || 0 }}</span>
                </div>
              </div>
            </div>

            <div v-if="!total" class="py-4 text-center text-muted">
              Aún no hay pendientes registrados.
            </div>
          </div>
        </div>
      </InovaAcceso>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.dona { width: 210px; max-width: 100%; display: inline-block; }
.dona-bg { stroke: var(--ui-bg-accented); }
.dona-total { font-size: 8px; font-weight: 800; fill: var(--ui-text-highlighted); }
.dona-sub { font-size: 3px; fill: var(--ui-text-muted); }
</style>
