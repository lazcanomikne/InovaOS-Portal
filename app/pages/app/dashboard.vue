<script setup>
// Dashboard principal del portal: saludo, búsqueda global y accesos rápidos
// agrupados por módulo (menú de SQL filtrado por permisos del usuario).
import { useAuthStore } from '~/stores/auth'
import { useNotificationsStore } from '~/stores/notifications'
import axios from '~/utils/axios'

const router = useRouter()
const authStore = useAuthStore()
const notifStore = useNotificationsStore()

const nombre = computed(() => {
  const u = authStore.user || {}
  const full = u.name || u.FullName || u.fullName || u.email || 'Usuario'
  return String(full).split(' ')[0] // primer nombre
})
const saludo = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
})

// --- Búsqueda global ---
const query = ref('')
const searching = ref(false)
const groups = ref([])
let debounce
const onSearch = () => {
  clearTimeout(debounce)
  const q = (query.value || '').trim()
  if (q.length < 2) { groups.value = []; return }
  debounce = setTimeout(doSearch, 300)
}
const doSearch = async () => {
  const q = (query.value || '').trim()
  if (q.length < 2) return
  searching.value = true
  try {
    const r = await axios.get('/search/global', { params: { q } })
    groups.value = r.data.groups || []
  } catch { groups.value = [] } finally { searching.value = false }
}
const clearSearch = () => { query.value = ''; groups.value = [] }

const go = (path) => { if (path) router.push(path) }

// --- Accesos agrupados por módulo (menú del usuario, filtrado por permisos) ---
const gruposAccesos = ref([])
const fetchMenu = async () => {
  try {
    const r = await axios.get('/admin/my-menu')
    const grupos = []
    const generales = []
    ;(r.data || []).forEach((item) => {
      const icon = item.Icon || 'widget-outline'
      if (item.children && item.children.length) {
        const items = item.children.filter(ch => ch.Path).map(ch => ({ title: ch.Title, path: ch.Path, icon }))
        if (item.Path) items.unshift({ title: item.Title, path: item.Path, icon })
        if (items.length) grupos.push({ module: item.Title, icon, items })
      } else if (item.Path) {
        generales.push({ title: item.Title, path: item.Path, icon })
      }
    })
    if (generales.length) grupos.push({ module: 'General', icon: 'widget-outline', items: generales })
    gruposAccesos.value = grupos
  } catch { gruposAccesos.value = [] }
}

onMounted(() => {
  if (!authStore.user) authStore.restoreSession()
  fetchMenu()
})

// Los iconos de los resultados vienen de SQL como `mdi-xxx`; Nuxt UI los pide
// con el prefijo `i-` (i-mdi-xxx). Los accesos usan la colección `solar`.
const iconoResultado = (nombreIcono) => {
  const n = nombreIcono || 'mdi-file-outline'
  return n.startsWith('i-') ? n : `i-${n}`
}
</script>

<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Inicio" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UTooltip text="Notificaciones">
            <UButton
              color="neutral"
              variant="ghost"
              square
              @click="notifStore.openDrawer()"
            >
              <UChip
                color="error"
                :show="notifStore.unread > 0"
                inset
              >
                <UIcon name="solar:bell-bold-duotone" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <!-- Saludo -->
        <div class="mb-6">
          <h1 class="text-2xl md:text-3xl font-bold text-highlighted">
            {{ saludo }}, {{ nombre }}
          </h1>
          <p class="text-lg text-muted mt-1">
            ¿Qué vamos a hacer hoy?
          </p>
        </div>

        <!-- Búsqueda global -->
        <UInput
          v-model="query"
          placeholder="Busca lo que sea: montos, fechas, clientes, conceptos, folios, usuarios…"
          icon="i-mdi-magnify"
          size="xl"
          :loading="searching"
          class="w-full"
          @update:model-value="onSearch"
          @keyup.enter="doSearch"
        >
          <template v-if="query" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-mdi-close"
              aria-label="Limpiar búsqueda"
              @click="clearSearch"
            />
          </template>
        </UInput>

        <!-- Resultados -->
        <UCard
          v-if="query && query.length >= 2"
          class="mt-2 max-h-[60vh] overflow-y-auto"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <div v-if="searching && !groups.length" class="p-6 text-center text-muted">
            <UIcon name="i-lucide-loader-circle" class="animate-spin size-5 align-middle mr-2" />
            Buscando…
          </div>

          <div v-else-if="!groups.length" class="p-6 text-center text-muted">
            Sin resultados para “{{ query }}”.
          </div>

          <div v-else>
            <div
              v-for="(g, gi) in groups"
              :key="g.module"
            >
              <div class="flex items-center gap-2 px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted">
                <UIcon :name="iconoResultado(g.icon)" class="size-4 text-primary" />
                {{ g.module }}
              </div>

              <button
                v-for="(it, i) in g.items"
                :key="i"
                type="button"
                class="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-elevated transition-colors"
                @click="go(it.to)"
              >
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-highlighted truncate">
                    {{ it.title }}
                  </div>
                  <div class="text-sm text-muted truncate">
                    {{ it.subtitle }}
                  </div>
                </div>
                <UIcon name="i-mdi-arrow-top-right" class="size-4 text-dimmed shrink-0" />
              </button>

              <USeparator v-if="gi < groups.length - 1" />
            </div>
          </div>
        </UCard>

        <!-- Accesos por módulo -->
        <h2 class="text-sm font-bold uppercase tracking-wide text-muted mt-10 mb-3">
          Accesos rápidos
        </h2>

        <div
          v-for="g in gruposAccesos"
          :key="g.module"
          class="mb-5"
        >
          <div class="flex items-center gap-2 mb-2">
            <span class="flex items-center justify-center size-7 rounded-full bg-primary/10 text-primary shrink-0">
              <UIcon :name="`solar:${g.icon}`" class="size-4" />
            </span>
            <span class="text-sm font-bold text-highlighted">{{ g.module }}</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <button
              v-for="acc in g.items"
              :key="acc.path"
              type="button"
              class="flex items-center gap-3 p-4 text-left rounded-lg border border-default bg-default cursor-pointer transition duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
              @click="go(acc.path)"
            >
              <span class="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary shrink-0">
                <UIcon :name="`solar:${acc.icon}`" class="size-5" />
              </span>
              <span class="font-medium text-highlighted">{{ acc.title }}</span>
            </button>
          </div>
        </div>

        <div v-if="!gruposAccesos.length" class="text-center text-muted py-6">
          No tienes accesos asignados.
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
