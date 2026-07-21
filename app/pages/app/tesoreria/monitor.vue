<script setup>
// Monitor de Sobres (tesorería).
// Migrado desde views/tesoreria/Sobres.vue (Vuetify 3).
import axios from '~/utils/axios'

const toast = useToast()

const loading = ref(false)
const sobres = ref([]) // desde /tesoreria/sobres (incluye saldo)
const rawTransactions = ref([]) // todas las operaciones
const selected = ref(null)
const search = ref('')
const filtroMov = ref('Todos')

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el contenido largo se recorta con elipsis en vez de
// ensanchar la tabla. Los pesos suman 100%.
const movHeaders = [
  { key: 'fecha', title: 'Fecha', w: 'w-[13%]' },
  { key: 'concepto', title: 'Concepto', w: 'w-[22%]' },
  { key: 'tipo', title: 'Tipo', w: 'w-[9%]' },
  { key: 'contraparte', title: 'Contraparte', w: 'w-[17%]' },
  { key: 'entrada', title: 'Entrada', w: 'w-[10%]', align: 'end' },
  { key: 'salida', title: 'Salida', w: 'w-[10%]', align: 'end' },
  { key: 'saldoAcumulado', title: 'Saldo', w: 'w-[10%]', align: 'end' },
  { key: 'usuario', title: 'Usuario', w: 'w-[9%]' }
]

const movColumns = movHeaders.map(h => ({
  accessorKey: h.key,
  header: h.title,
  meta: {
    class: {
      // El ancho se declara en el th; con `table-fixed` el td lo hereda.
      th: [h.w, 'px-2', h.align === 'end' ? 'text-right' : ''].filter(Boolean).join(' '),
      // `truncate` recorta con elipsis en lugar de ensanchar la columna.
      td: ['px-2 truncate', h.align === 'end' ? 'text-right' : ''].filter(Boolean).join(' ')
    }
  }
}))

const filtrosMov = [
  { value: 'Todos', label: 'Todos' },
  { value: 'entrada', label: 'Entradas' },
  { value: 'salida', label: 'Salidas' }
]

// Distingue la primera carga (mostramos esqueletos) de las recargas posteriores
// (mantenemos los datos visibles para que la pantalla no parpadee).
const cargaInicial = computed(() => loading.value && !sobres.value.length)

// El único filtro que afecta a la tabla de movimientos es el conmutador
// Entradas / Salidas; «Todos» equivale a sin filtro.
const hayFiltroMov = computed(() => filtroMov.value !== 'Todos')
const limpiarFiltroMov = () => {
  filtroMov.value = 'Todos'
}

const saldoTotal = computed(() => sobres.value.reduce((a, s) => a + Number(s.saldo || 0), 0))
const sobresFiltrados = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return sobres.value
  return sobres.value.filter(s => s.nombre.toLowerCase().includes(q))
})

// Estadística rápida por sobre para las tarjetas
const statFor = (nombre) => {
  let count = 0
  rawTransactions.value.forEach((t) => { if (t.sobre_origen === nombre || t.sobre_destino === nombre) count++ })
  return { count }
}

const load = async () => {
  loading.value = true
  try {
    const [rs, ro] = await Promise.all([
      axios.get('/tesoreria/sobres'),
      axios.get('/tesoreria/operaciones')
    ])
    sobres.value = rs.data
    rawTransactions.value = ro.data.map(item => ({
      id: item.id,
      fecha: item.fecha || item.created_at,
      concepto: item.concepto,
      tipo: item.tipo,
      monto: parseFloat(item.monto || 0),
      categoria: item.categoria,
      subcategoria: item.subcategoria,
      origen_ingreso: item.origen_ingreso,
      sobre_origen: item.sobre_origen,
      sobre_destino: item.sobre_destino,
      usuario: item.usuario
    }))
  } catch (e) {
    toast.add({ title: 'Error cargando sobres', color: 'error' })
  } finally {
    loading.value = false
  }
}

const enter = (s) => { selected.value = s; filtroMov.value = 'Todos' }
const back = () => { selected.value = null }

// Detalle del sobre seleccionado: movimientos con saldo corrido + totales
const detalle = computed(() => {
  if (!selected.value) return { movs: [], entradas: 0, salidas: 0 }
  const nombre = selected.value.nombre
  const filtered = rawTransactions.value.filter(t => t.sobre_origen === nombre || t.sobre_destino === nombre)
  filtered.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
  let saldo = 0, entradas = 0, salidas = 0
  const mapped = filtered.map((t) => {
    const entra = t.sobre_destino === nombre ? t.monto : 0
    const sale = t.sobre_origen === nombre ? t.monto : 0
    saldo += entra - sale; entradas += entra; salidas += sale
    let contraparte = '-'
    if (t.tipo === 'Traspaso') contraparte = entra ? `De: ${t.sobre_origen}` : `A: ${t.sobre_destino}`
    else if (entra) contraparte = t.origen_ingreso || 'Ingreso'
    else contraparte = `${t.categoria || 'Gasto'}${t.subcategoria ? ' / ' + t.subcategoria : ''}`
    return { ...t, entrada: entra, salida: sale, saldoAcumulado: saldo, contraparte }
  })
  return { movs: mapped.reverse(), entradas, salidas }
})

const movsFiltrados = computed(() => {
  if (filtroMov.value === 'entrada') return detalle.value.movs.filter(m => m.entrada > 0)
  if (filtroMov.value === 'salida') return detalle.value.movs.filter(m => m.salida > 0)
  return detalle.value.movs
})

// Paginación de la tabla de movimientos (el v-data-table original usaba 15 por página)
const MOV_PAGE_SIZE = 15
const movPage = ref(1)
const movsPagina = computed(() => {
  const start = (movPage.value - 1) * MOV_PAGE_SIZE
  return movsFiltrados.value.slice(start, start + MOV_PAGE_SIZE)
})
watch([filtroMov, selected], () => { movPage.value = 1 })

const money = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
const tipoColor = t => t === 'Ingreso' ? 'success' : (t === 'Egreso' ? 'error' : 'warning')
const accentName = saldo => Number(saldo) < 0 ? 'error' : (Number(saldo) > 0 ? 'success' : 'primary')
const accentBorde = saldo => Number(saldo) < 0
  ? 'border-l-4 border-l-error'
  : (Number(saldo) > 0 ? 'border-l-4 border-l-success' : 'border-l-4 border-l-primary')
const accentClase = (saldo) => {
  const c = accentName(saldo)
  if (c === 'error') return 'bg-error/10 text-error'
  if (c === 'success') return 'bg-success/10 text-success'
  return 'bg-primary/10 text-primary'
}

onMounted(load)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="tesoreria-monitor-sobres" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Monitor de Sobres">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UInput
            v-if="!selected"
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Buscar sobre…"
            class="w-60"
          />
          <UTooltip text="Recargar">
            <UButton
              icon="i-mdi-refresh"
              color="neutral"
              variant="ghost"
              square
              :loading="loading"
              @click="load"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- ================= VISTA LISTA ================= -->
      <template v-if="!selected">
        <!-- Resumen -->
        <div class="grid grid-cols-12 gap-3 mb-4 shrink-0">
          <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al recargar -->
          <template v-if="cargaInicial">
            <div v-for="i in 3" :key="`kpi-skel-${i}`" class="col-span-12 sm:col-span-4">
              <UCard :ui="{ body: 'py-4' }">
                <div class="flex items-center gap-4">
                  <USkeleton class="size-10 rounded-full shrink-0" />
                  <div class="flex-1">
                    <USkeleton class="h-5 w-24 mb-2" />
                    <USkeleton class="h-3 w-16" />
                  </div>
                </div>
              </UCard>
            </div>
          </template>

          <template v-else>
            <div class="col-span-12 sm:col-span-4">
              <UCard :ui="{ body: 'py-4' }">
                <div class="flex items-center gap-4">
                  <UAvatar icon="i-mdi-wallet-outline" size="lg" class="bg-primary/10 text-primary" />
                  <div>
                    <div class="text-xl font-bold text-highlighted">
                      {{ sobres.length }}
                    </div>
                    <div class="text-xs text-muted">
                      Sobres
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
            <div class="col-span-12 sm:col-span-4">
              <UCard :ui="{ body: 'py-4' }">
                <div class="flex items-center gap-4">
                  <UAvatar icon="i-mdi-cash-multiple" size="lg" class="bg-success/10 text-success" />
                  <div>
                    <div class="text-xl font-bold" :class="saldoTotal < 0 ? 'text-error' : 'text-highlighted'">
                      {{ money(saldoTotal) }}
                    </div>
                    <div class="text-xs text-muted">
                      Saldo total
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
            <div class="col-span-12 sm:col-span-4">
              <UCard :ui="{ body: 'py-4' }">
                <div class="flex items-center gap-4">
                  <UAvatar icon="i-mdi-swap-horizontal" size="lg" class="bg-info/10 text-info" />
                  <div>
                    <div class="text-xl font-bold text-highlighted">
                      {{ rawTransactions.length }}
                    </div>
                    <div class="text-xs text-muted">
                      Movimientos
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </template>
        </div>

        <div class="text-muted mb-3 shrink-0">
          Selecciona un sobre para ver su detalle
        </div>

        <!-- El listado de sobres es el único bloque que scrollea en esta vista. -->
        <div class="grid grid-cols-12 gap-4 flex-1 min-h-0 overflow-y-auto">
          <div
            v-for="s in sobresFiltrados"
            :key="s.id"
            class="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3"
          >
            <UCard
              class="h-full cursor-pointer transition-transform hover:-translate-y-1"
              :class="accentBorde(s.saldo)"
              :ui="{ body: 'p-5' }"
              @click="enter(s)"
            >
              <div class="flex items-center justify-between mb-4">
                <UAvatar
                  :icon="s.es_entrada ? 'i-mdi-inbox-arrow-down' : 'i-mdi-email-outline'"
                  size="md"
                  :class="accentClase(s.saldo)"
                />
                <div class="flex items-center gap-1">
                  <UBadge
                    v-if="s.es_entrada"
                    size="sm"
                    color="info"
                    variant="subtle"
                  >
                    Entrada
                  </UBadge>
                  <UTooltip v-if="s.no_eliminable" text="No eliminable">
                    <UIcon name="i-mdi-lock" class="size-4 text-muted" />
                  </UTooltip>
                </div>
              </div>

              <div class="font-bold text-highlighted truncate">
                {{ s.nombre }}
              </div>
              <div class="text-xs text-muted truncate mb-3" :title="s.descripcion">
                {{ s.descripcion || 'Sin descripción' }}
              </div>

              <div class="text-xl font-bold mb-1" :class="Number(s.saldo) < 0 ? 'text-error' : 'text-primary'">
                {{ money(s.saldo) }}
              </div>

              <USeparator class="my-3" />

              <div class="flex justify-between items-center">
                <div class="text-center">
                  <div class="text-xs text-success font-bold">
                    {{ statFor(s.nombre).count }}
                  </div>
                  <div class="text-muted text-[10px]">
                    movs
                  </div>
                </div>
                <span class="text-xs text-primary font-bold uppercase flex items-center gap-1">
                  Ver detalle <UIcon name="i-mdi-arrow-right" class="size-4" />
                </span>
              </div>
            </UCard>
          </div>

          <div v-if="!loading && !sobresFiltrados.length" class="col-span-12">
            <div class="text-center text-muted py-10">
              <UIcon name="i-mdi-email-off-outline" class="size-14 mb-2" />
              <div>No hay sobres que coincidan.</div>
            </div>
          </div>
        </div>
      </template>

      <!-- ================= VISTA DETALLE ================= -->
      <template v-else>
        <div class="flex items-center flex-wrap gap-3 mb-4 shrink-0">
          <UButton
            variant="soft"
            color="primary"
            icon="i-mdi-arrow-left"
            @click="back"
          >
            Volver
          </UButton>
          <UAvatar
            :icon="selected.es_entrada ? 'i-mdi-inbox-arrow-down' : 'i-mdi-email-outline'"
            size="md"
            :class="accentClase(selected.saldo)"
          />
          <div>
            <div class="text-xl font-bold text-highlighted flex items-center gap-2">
              {{ selected.nombre }}
              <UBadge
                v-if="selected.es_entrada"
                size="sm"
                color="info"
                variant="subtle"
              >
                Entrada
              </UBadge>
            </div>
            <div class="text-xs text-muted">
              {{ selected.descripcion || 'Sin descripción' }}
            </div>
          </div>
        </div>

        <!-- Stats del sobre -->
        <div class="grid grid-cols-12 gap-3 mb-4 shrink-0">
          <div class="col-span-6 md:col-span-3">
            <UCard :ui="{ body: 'py-4 text-center' }">
              <div class="text-xs text-muted mb-1">
                Saldo actual
              </div>
              <div class="text-xl font-bold" :class="Number(selected.saldo) < 0 ? 'text-error' : 'text-primary'">
                {{ money(selected.saldo) }}
              </div>
            </UCard>
          </div>
          <div class="col-span-6 md:col-span-3">
            <UCard :ui="{ body: 'py-4 text-center' }">
              <div class="text-xs text-muted mb-1">
                Entradas
              </div>
              <div class="text-xl font-bold text-success">
                {{ money(detalle.entradas) }}
              </div>
            </UCard>
          </div>
          <div class="col-span-6 md:col-span-3">
            <UCard :ui="{ body: 'py-4 text-center' }">
              <div class="text-xs text-muted mb-1">
                Salidas
              </div>
              <div class="text-xl font-bold text-error">
                {{ money(detalle.salidas) }}
              </div>
            </UCard>
          </div>
          <div class="col-span-6 md:col-span-3">
            <UCard :ui="{ body: 'py-4 text-center' }">
              <div class="text-xs text-muted mb-1">
                Movimientos
              </div>
              <div class="text-xl font-bold text-highlighted">
                {{ detalle.movs.length }}
              </div>
            </UCard>
          </div>
        </div>

        <!-- La tarjeta ocupa el espacio restante; sólo la tabla scrollea. -->
        <UCard
          class="flex-1 min-h-0 flex flex-col"
          :ui="{ header: 'shrink-0', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
        >
          <template #header>
            <div class="flex items-center flex-wrap gap-2">
              <UIcon name="i-mdi-history" class="size-5 text-primary" />
              <span class="font-semibold text-highlighted">Auxiliar de movimientos</span>
              <div class="flex-1" />
              <div class="flex gap-1">
                <UButton
                  v-for="f in filtrosMov"
                  :key="f.value"
                  size="sm"
                  :color="filtroMov === f.value ? 'primary' : 'neutral'"
                  :variant="filtroMov === f.value ? 'solid' : 'outline'"
                  @click="filtroMov = f.value"
                >
                  {{ f.label }}
                </UButton>
              </div>
            </div>
          </template>

          <UTable
            :data="movsPagina"
            :columns="movColumns"
            :loading="loading"
            sticky="header"
            class="text-xs flex-1 min-h-0 overflow-y-auto"
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
                  <USkeleton class="h-4 w-28 shrink-0" />
                  <USkeleton class="h-4 flex-1" />
                  <USkeleton class="h-4 w-16 shrink-0" />
                  <USkeleton class="h-4 w-32 shrink-0" />
                  <USkeleton class="h-4 w-20 shrink-0" />
                  <USkeleton class="h-4 w-20 shrink-0" />
                </div>
              </div>
            </template>

            <!-- Vacío: distingue "no hay nada" de "el filtro no deja ver nada",
                 y ofrece la acción correspondiente en cada caso. -->
            <template #empty>
              <div class="py-12 px-6 text-center">
                <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                  <UIcon
                    :name="hayFiltroMov ? 'i-lucide-filter-x' : 'i-lucide-inbox'"
                    class="size-7 text-primary"
                  />
                </div>

                <p class="font-semibold text-highlighted mb-1">
                  {{ hayFiltroMov ? 'Ningún movimiento coincide con los filtros' : 'Sin movimientos en este sobre' }}
                </p>
                <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                  {{ hayFiltroMov
                    ? 'Este sobre no registra movimientos del tipo seleccionado.'
                    : 'Todavía no se ha registrado ninguna entrada ni salida en este sobre.' }}
                </p>

                <UButton
                  v-if="hayFiltroMov"
                  label="Limpiar filtros"
                  icon="i-lucide-circle-x"
                  color="neutral"
                  variant="subtle"
                  @click="limpiarFiltroMov"
                />
                <UButton
                  v-else
                  label="Recargar"
                  icon="i-lucide-refresh-cw"
                  color="neutral"
                  variant="subtle"
                  @click="load"
                />
              </div>
            </template>

            <template #fecha-cell="{ row }">
              <span class="block truncate text-muted" :title="fmtDate(row.original.fecha)">{{ fmtDate(row.original.fecha) }}</span>
            </template>
            <template #concepto-cell="{ row }">
              <span class="block truncate" :title="row.original.concepto">{{ row.original.concepto || '—' }}</span>
            </template>
            <template #contraparte-cell="{ row }">
              <span class="block truncate" :title="row.original.contraparte">{{ row.original.contraparte }}</span>
            </template>
            <template #usuario-cell="{ row }">
              <span class="block truncate" :title="row.original.usuario">{{ row.original.usuario || '—' }}</span>
            </template>
            <template #tipo-cell="{ row }">
              <UBadge
                :color="tipoColor(row.original.tipo)"
                variant="subtle"
                size="sm"
                class="font-bold"
              >
                {{ row.original.tipo }}
              </UBadge>
            </template>
            <template #entrada-cell="{ row }">
              <span v-if="row.original.entrada > 0" class="text-success font-bold whitespace-nowrap">+{{ money(row.original.entrada) }}</span>
              <span v-else class="text-muted">-</span>
            </template>
            <template #salida-cell="{ row }">
              <span v-if="row.original.salida > 0" class="text-error font-bold whitespace-nowrap">-{{ money(row.original.salida) }}</span>
              <span v-else class="text-muted">-</span>
            </template>
            <template #saldoAcumulado-cell="{ row }">
              <strong class="text-primary whitespace-nowrap">{{ money(row.original.saldoAcumulado) }}</strong>
            </template>
          </UTable>

          <!-- Pie fijo: la paginación queda fuera del área scrolleable. -->
          <div v-if="movsFiltrados.length > MOV_PAGE_SIZE" class="flex justify-center p-3 border-t border-default shrink-0">
            <UPagination
              v-model:page="movPage"
              :items-per-page="MOV_PAGE_SIZE"
              :total="movsFiltrados.length"
            />
          </div>
        </UCard>
      </template>
    </template>
  </UDashboardPanel>
</template>
