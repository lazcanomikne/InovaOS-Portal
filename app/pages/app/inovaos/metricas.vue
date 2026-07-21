<script setup>
// InovaOS — Métricas. Portado de views/inovaos/InovaMetricas.vue (Vuetify 3).
import { useInovaosStore } from '~/stores/inovaos'
import InovaTabs from '~/components/inovaos/InovaTabs.vue'
import InovaAcceso from '~/components/inovaos/InovaAcceso.vue'

const store = useInovaosStore()
const inicial = n => (n || '?').trim().charAt(0).toUpperCase()

// Clases por token. Tailwind necesita nombres de clase literales, así que se
// listan completos en lugar de construirlos por interpolación.
const TONOS = {
  // Semánticos: reservados para el semáforo de atención.
  success: { texto: 'text-success', fondo: 'bg-success/10' },
  warning: { texto: 'text-warning', fondo: 'bg-warning/10' },
  error: { texto: 'text-error', fondo: 'bg-error/10' },
  // De marca: para los indicadores que sólo son decorativos.
  marca: { texto: 'text-primary', fondo: 'bg-primary/10' },
  neutro: { texto: 'text-ink-600 dark:text-ink-300', fondo: 'bg-ink-500/10' }
}

// El cumplimiento es un ESTADO de atención (verde/ámbar/rojo), no una
// categoría, así que se mapea a los tokens semánticos. Sin dato, tono neutro.
const tonoCumpl = (v) => {
  if (v === null || v === undefined) return 'neutro'
  if (v >= 80) return 'success'
  if (v >= 50) return 'warning'
  return 'error'
}

// Los retrasos también son estado: cualquier retraso pide atención.
const tonoRetrasos = n => (n > 0 ? 'error' : 'success')

const claseTexto = tono => TONOS[tono].texto
const claseTile = tono => TONOS[tono].fondo

const tiempo = (h) => {
  if (h === null || h === undefined) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} d`
}

const cargar = () => store.fetchMetricas()
</script>

<template>
  <UDashboardPanel id="inovaos-metricas">
    <template #header>
      <UDashboardNavbar title="Métricas">
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
        <div class="mx-auto w-full max-w-5xl">
          <div class="mb-5 flex items-center gap-2">
            <UIcon name="i-mdi-chart-bar" class="size-6 text-primary" />
            <div>
              <h1 class="text-xl font-bold text-highlighted">
                Métricas
              </h1>
              <p class="text-sm text-muted">
                {{ store.metricas.direccion ? 'Desempeño de cada colaborador.' : 'Tu desempeño como responsable.' }}
              </p>
            </div>
          </div>

          <div v-if="store.loadingMetricas" class="py-16 text-center">
            <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
          </div>

          <div v-else-if="!store.metricas.colaboradores.length" class="py-16 text-center text-muted">
            <UIcon name="i-mdi-chart-bar" class="mb-2 size-10 text-primary" />
            <div>Aún no hay datos suficientes para calcular métricas.</div>
          </div>

          <div v-else class="grid grid-cols-12 gap-4">
            <div
              v-for="c in store.metricas.colaboradores"
              :key="c.id"
              class="col-span-12 rounded-2xl border border-default bg-default p-4 md:col-span-6"
            >
              <div class="mb-3 flex items-center gap-3">
                <UAvatar
                  :text="inicial(c.nombre)"
                  :alt="c.nombre"
                  size="lg"
                  class="bg-primary font-bold text-inverted"
                />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-bold text-highlighted">
                    {{ c.nombre }}
                  </div>
                  <div class="text-xs text-muted">
                    {{ c.total }} asignados · {{ c.completados }} completados
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <!-- Semáforo: el color indica estado de atención (semánticos) -->
                <div class="rounded-2xl px-2.5 py-3 text-center" :class="claseTile(tonoCumpl(c.cumplimiento))">
                  <UIcon name="i-mdi-seal-variant" class="size-4.5" :class="claseTexto(tonoCumpl(c.cumplimiento))" />
                  <div class="my-1 text-xl font-extrabold leading-none" :class="claseTexto(tonoCumpl(c.cumplimiento))">
                    {{ c.cumplimiento === null ? '—' : c.cumplimiento + '%' }}
                  </div>
                  <div class="text-[0.7rem] text-muted">
                    Cumplimiento
                  </div>
                </div>

                <!-- Decorativo: no hay umbral de "bien/mal", va en azul de marca -->
                <div class="rounded-2xl px-2.5 py-3 text-center" :class="claseTile('marca')">
                  <UIcon name="i-mdi-timer-outline" class="size-4.5" :class="claseTexto('marca')" />
                  <div class="my-1 text-xl font-extrabold leading-none" :class="claseTexto('marca')">
                    {{ tiempo(c.tiempo_respuesta_horas) }}
                  </div>
                  <div class="text-[0.7rem] text-muted">
                    Respuesta
                  </div>
                </div>

                <!-- Semáforo: hay retrasos o no los hay (semánticos) -->
                <div class="rounded-2xl px-2.5 py-3 text-center" :class="claseTile(tonoRetrasos(c.retrasos))">
                  <UIcon name="i-mdi-alert-outline" class="size-4.5" :class="claseTexto(tonoRetrasos(c.retrasos))" />
                  <div class="my-1 text-xl font-extrabold leading-none" :class="claseTexto(tonoRetrasos(c.retrasos))">
                    {{ c.retrasos }}
                  </div>
                  <div class="text-[0.7rem] text-muted">
                    Retrasos
                  </div>
                </div>

                <!-- Decorativo: conteo sin umbral, gris de marca -->
                <div class="rounded-2xl px-2.5 py-3 text-center" :class="claseTile('neutro')">
                  <UIcon name="i-mdi-paperclip" class="size-4.5" :class="claseTexto('neutro')" />
                  <div class="my-1 text-xl font-extrabold leading-none" :class="claseTexto('neutro')">
                    {{ c.calidad_evidencia === null ? '—' : c.calidad_evidencia }}
                  </div>
                  <div class="text-[0.7rem] text-muted">
                    Evidencia
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </InovaAcceso>
    </template>
  </UDashboardPanel>
</template>
