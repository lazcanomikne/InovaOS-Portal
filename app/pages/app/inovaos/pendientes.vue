<script setup>
// InovaOS — Pendientes. Portado de views/inovaos/InovaPendientes.vue (Vuetify 3).
import { useInovaosStore } from '~/stores/inovaos'
import {
  CATEGORIAS, ST_HEX, estatusColor, etiquetaEstatus, formatFecha,
  relacionCon, etiquetaRelacion, enCategoria, msgError
} from '~/utils/inova-helpers'
import InovaTabs from '~/components/inovaos/InovaTabs.vue'
import InovaAcceso from '~/components/inovaos/InovaAcceso.vue'
import DetalleDrawer from '~/components/inovaos/DetalleDrawer.vue'

const store = useInovaosStore()
const toast = useToast()
const notificar = (texto, color = 'success') => toast.add({ title: texto, color })

const busqueda = ref('')
const relacion = ref('todas')
const RELACIONES = [
  { key: 'todas', label: 'Todas' },
  { key: 'mia', label: 'Para mí' },
  { key: 'delegada', label: 'Yo delegué' }
]

const filtro = computed({ get: () => store.filtro, set: v => store.setFiltro(v) })
const verArchivados = computed(() => filtro.value === 'archivados')
const items = computed(() => (verArchivados.value ? store.archivados : store.pendientes))

// Equivale al rango de diacríticos combinantes del original (̀-ͯ).
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const coincideBusqueda = (p) => {
  const q = norm((busqueda.value || '').trim())
  if (!q) return true
  return [p.titulo, p.descripcion, p.responsable_nombre, p.area, p.cliente, p.tipo, p.prioridad, etiquetaEstatus(p.estatus)]
    .map(norm).join(' ').includes(q)
}
const coincideRelacion = (p) => {
  if (relacion.value === 'todas') return true
  const r = relacionCon(p, store.myId)
  if (relacion.value === 'mia') return r === 'mia' || r === 'ambas'
  if (relacion.value === 'delegada') return r === 'delegada' || r === 'ambas'
  return true
}

const enRelacion = computed(() => items.value.filter(coincideRelacion))
const filtrados = computed(() => {
  if ((busqueda.value || '').trim()) return enRelacion.value.filter(coincideBusqueda)
  return verArchivados.value ? enRelacion.value : enRelacion.value.filter(p => enCategoria(p, filtro.value, store.myId))
})
const conteo = (key) => {
  if (key === 'archivados') return store.archivados.filter(coincideRelacion).length
  return store.pendientes.filter(coincideRelacion).filter(p => enCategoria(p, key, store.myId)).length
}

const etiquetaFiltro = computed(() => CATEGORIAS.find(c => c.key === filtro.value)?.label ?? '')
const mensajeVacio = computed(() => {
  if ((busqueda.value || '').trim()) return `Sin resultados para «${busqueda.value.trim()}».`
  if (verArchivados.value) return 'No tienes pendientes archivados.'
  if (filtro.value === 'inmediata') return 'Nada requiere tu atención inmediata.'
  return `Nada en «${etiquetaFiltro.value}».`
})
const limpiar = () => {
  filtro.value = 'inmediata'
  relacion.value = 'todas'
  busqueda.value = ''
}

const alternarArchivo = async (p) => {
  try {
    await store.archivar(p.id, !verArchivados.value)
    notificar(verArchivados.value ? 'Desarchivado' : 'Archivado')
  } catch (err) {
    notificar(msgError(err), 'error')
  }
}

watch(verArchivados, (v) => {
  if (v && !store.archivadosCargados) store.fetchArchivados()
})

const cargar = () => store.fetchPendientes()

// Clases de la etiqueta de relación (equivalente a .rel-mia / .rel-delegada).
const claseRelacion = (p) => {
  const r = relacionCon(p, store.myId)
  return r === 'delegada'
    ? 'bg-warning/15 text-warning'
    : 'bg-primary/15 text-primary'
}
</script>

<template>
  <UDashboardPanel id="inovaos-pendientes">
    <template #header>
      <UDashboardNavbar title="Pendientes">
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
          <!-- Buscador -->
          <UInput
            v-model="busqueda"
            placeholder="Buscar en pendientes..."
            icon="i-mdi-magnify"
            size="lg"
            class="mb-3 w-full"
            :ui="{ base: 'rounded-xl' }"
          >
            <template v-if="busqueda" #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-mdi-close"
                size="sm"
                @click="busqueda = ''"
              />
            </template>
          </UInput>

          <!-- Relación -->
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="inline-flex gap-1 rounded-2xl bg-elevated p-1">
              <button
                v-for="r in RELACIONES"
                :key="r.key"
                type="button"
                class="cursor-pointer rounded-xl px-4 py-1.5 text-sm font-semibold transition"
                :class="relacion === r.key ? 'bg-default text-primary shadow-sm' : 'text-muted hover:text-default'"
                @click="relacion = r.key"
              >
                {{ r.label }}
              </button>
            </div>
          </div>

          <!-- Pilas -->
          <div class="mb-4 flex flex-wrap gap-2">
            <button
              v-for="c in CATEGORIAS"
              :key="c.key"
              type="button"
              class="inline-flex cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition"
              :class="filtro === c.key
                ? 'bg-primary text-inverted shadow-md'
                : 'bg-elevated text-muted hover:bg-accented'"
              @click="filtro = c.key"
            >
              {{ c.label }}
              <span
                v-if="conteo(c.key)"
                class="rounded-full px-1.5 py-px text-[0.68rem] font-extrabold"
                :class="filtro === c.key ? 'bg-white/25' : 'bg-black/10 dark:bg-white/10'"
              >{{ conteo(c.key) }}</span>
            </button>
          </div>

          <div v-if="store.loading" class="py-10 text-center">
            <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
          </div>

          <template v-else>
            <div v-if="filtrados.length" class="rounded-2xl border border-default bg-default">
              <template v-for="(p, i) in filtrados" :key="p.id">
                <div
                  class="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-elevated/50"
                  @click="store.abrirDetalle(p.id)"
                >
                  <span
                    class="inline-block size-3 shrink-0 rounded-full"
                    :style="{ background: ST_HEX[estatusColor(p)] }"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="truncate font-medium text-highlighted">{{ p.titulo }}</span>
                      <UBadge
                        color="neutral"
                        variant="subtle"
                        size="sm"
                        class="shrink-0"
                      >
                        {{ p.prioridad }}
                      </UBadge>
                    </div>
                    <div class="mt-1 truncate text-sm text-muted">
                      <span
                        v-if="etiquetaRelacion(p, store.myId)"
                        class="mr-1.5 rounded-full px-2 py-px text-xs font-bold"
                        :class="claseRelacion(p)"
                      >{{ etiquetaRelacion(p, store.myId) }}</span>
                      {{ p.responsable_nombre || 'Sin asignar' }} · {{ etiquetaEstatus(p.estatus) }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="hidden text-xs text-muted sm:block">Vence {{ formatFecha(p.fecha_compromiso) }}</span>
                    <UButton
                      :icon="verArchivados ? 'i-mdi-archive-arrow-up-outline' : 'i-mdi-archive-arrow-down-outline'"
                      size="sm"
                      color="neutral"
                      variant="ghost"
                      @click.stop="alternarArchivo(p)"
                    />
                  </div>
                </div>
                <USeparator v-if="i < filtrados.length - 1" class="px-3" />
              </template>
            </div>

            <div v-else class="py-16 text-center text-muted">
              <UIcon name="i-mdi-clipboard-check-outline" class="mb-2 size-10 text-primary" />
              <div>{{ mensajeVacio }}</div>
              <UButton
                v-if="filtro !== 'inmediata' || relacion !== 'todas' || busqueda"
                class="mt-2"
                variant="ghost"
                color="primary"
                @click="limpiar"
              >
                Restablecer
              </UButton>
            </div>
          </template>
        </div>
      </InovaAcceso>

      <DetalleDrawer />
    </template>
  </UDashboardPanel>
</template>
