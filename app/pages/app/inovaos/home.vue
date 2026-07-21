<script setup>
// InovaOS — Inicio. Portado de views/inovaos/InovaHome.vue (Vuetify 3).
import { useInovaosStore } from '~/stores/inovaos'
import { useAuthStore } from '~/stores/auth'
import { SEMAFORO_HOME, ST_HEX, MAPA_FILTRO, estatusColor, formatFecha } from '~/utils/inova-helpers'
import InovaTabs from '~/components/inovaos/InovaTabs.vue'
import InovaAcceso from '~/components/inovaos/InovaAcceso.vue'
import DetalleDrawer from '~/components/inovaos/DetalleDrawer.vue'

const store = useInovaosStore()
const authStore = useAuthStore()
const primerNombre = computed(() => (authStore.user?.name || 'Usuario').split(' ')[0])

const activos = computed(() => ['vencido', 'hoy', 'manana', 'tiempo', 'espera'].reduce((a, k) => a + (store.resumen.semaforo[k] || 0), 0))
const tint = key => ST_HEX[key] + '16'

const accesos = [
  { to: '/app/inovaos/pendientes', icon: 'i-mdi-clipboard-list-outline', title: 'Pendientes', sub: 'Ver y filtrar' },
  { to: '/app/inovaos/tablero', icon: 'i-mdi-chart-donut', title: 'Tablero', sub: 'Semáforo' },
  { to: '/app/inovaos/metricas', icon: 'i-mdi-chart-bar', title: 'Métricas', sub: 'Desempeño' }
]

const verFiltrados = (key) => {
  store.setFiltro(MAPA_FILTRO[key] || key)
  navigateTo('/app/inovaos/pendientes')
}

const cargar = () => store.fetchResumen()
</script>

<template>
  <UDashboardPanel id="inovaos-home">
    <template #header>
      <UDashboardNavbar title="InovaTask">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="primary"
            icon="i-mdi-plus"
            to="/app/inovaos/crear"
          >
            Nuevo pendiente
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <InovaTabs />

      <InovaAcceso @listo="cargar">
        <div class="mx-auto w-full max-w-5xl">
          <!-- Hero -->
          <div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-br from-primary-500 to-primary-400 px-7 py-6 text-white shadow-lg">
            <div>
              <div class="text-2xl font-bold">
                Hola, {{ primerNombre }}
              </div>
              <div class="mt-1 text-sm text-white/80">
                {{ store.loadingResumen ? 'Cargando tu panel…' : (activos ? `Tienes ${activos} pendiente${activos === 1 ? '' : 's'} activo${activos === 1 ? '' : 's'}.` : 'Todo bajo control por ahora.') }}
              </div>
            </div>
            <UButton
              color="neutral"
              variant="solid"
              size="lg"
              icon="i-mdi-plus"
              to="/app/inovaos/crear"
              class="bg-white font-bold text-primary-600 hover:bg-white/90"
            >
              Nuevo pendiente
            </UButton>
          </div>

          <!-- Semáforo -->
          <div class="mb-3 ml-0.5 text-xs font-bold uppercase tracking-wider text-muted">
            Mis pendientes
          </div>
          <div class="mb-6 grid grid-cols-6 gap-3 sm:grid-cols-12">
            <div
              v-for="s in SEMAFORO_HOME"
              :key="s.key"
              class="relative col-span-3 cursor-pointer rounded-2xl border border-default px-4 pb-3 pt-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:col-span-4 md:col-span-2"
              :style="{ background: tint(s.key) }"
              @click="verFiltrados(s.key)"
            >
              <span
                class="absolute right-3.5 top-3.5 size-2.5 rounded-full"
                :style="{ background: ST_HEX[s.key] }"
              />
              <div class="text-3xl font-extrabold leading-none tracking-tight" :style="{ color: ST_HEX[s.key] }">
                {{ store.loadingResumen ? '·' : (store.resumen.semaforo[s.key] || 0) }}
              </div>
              <div class="mt-1.5 text-xs text-muted">
                {{ s.label }}
              </div>
            </div>
          </div>

          <!-- Accesos rápidos -->
          <div class="mb-3 ml-0.5 text-xs font-bold uppercase tracking-wider text-muted">
            Accesos rápidos
          </div>
          <div class="mb-6 grid grid-cols-12 gap-3">
            <div
              v-for="a in accesos"
              :key="a.to"
              class="col-span-12 flex cursor-pointer items-center gap-3 rounded-2xl border border-default bg-default p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:col-span-4"
              @click="navigateTo(a.to)"
            >
              <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UIcon :name="a.icon" class="size-6" />
              </div>
              <div>
                <div class="font-bold text-highlighted">
                  {{ a.title }}
                </div>
                <div class="text-xs text-muted">
                  {{ a.sub }}
                </div>
              </div>
            </div>
          </div>

          <!-- Próximos a vencer -->
          <div class="mb-3 ml-0.5 text-xs font-bold uppercase tracking-wider text-muted">
            Próximos a vencer
          </div>
          <div v-if="store.loadingResumen" class="py-6 text-center">
            <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
          </div>
          <div v-else class="rounded-2xl border border-default bg-default">
            <div v-if="store.resumen.proximos.length" class="py-1">
              <template v-for="(p, i) in store.resumen.proximos" :key="p.id">
                <div
                  class="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-elevated/50"
                  @click="store.abrirDetalle(p.id)"
                >
                  <span
                    class="inline-block size-3 shrink-0 rounded-full"
                    :style="{ background: ST_HEX[estatusColor(p)] }"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium text-highlighted">
                      {{ p.titulo }}
                    </div>
                    <div class="truncate text-sm text-muted">
                      {{ p.responsable_nombre || 'Sin asignar' }} · vence {{ formatFecha(p.fecha_compromiso) }}
                    </div>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ p.prioridad }}
                  </UBadge>
                </div>
                <USeparator v-if="i < store.resumen.proximos.length - 1" class="px-3" />
              </template>
            </div>
            <div v-else class="py-10 text-center text-muted">
              <UIcon name="i-mdi-check-circle-outline" class="mb-2 size-9 text-success" />
              <div>Nada por vencer.</div>
            </div>
          </div>
        </div>
      </InovaAcceso>

      <DetalleDrawer />
    </template>
  </UDashboardPanel>
</template>
