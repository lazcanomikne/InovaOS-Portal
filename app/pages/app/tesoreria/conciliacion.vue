<script setup>
// Conciliación de facturas de proveedor contra ingresos (tesorería).
// Migrado desde views/tesoreria/Conciliacion.vue (Vuetify 3).
import axios from '~/utils/axios'

const toast = useToast()

const facturas = ref([])
const ingresosLibres = ref([])
const abonos = ref([])
const selectedFactura = ref(null)
const loadingFac = ref(false), loadingIng = ref(false)
const linkingId = ref(null)
const search = ref('')
const filtroEstado = ref('Todas')
const notify = (text, color = 'success') => { toast.add({ title: text, color }) }

// `w` es el peso de la columna en porcentaje. Las tablas usan `table-fixed`, así
// que estos anchos mandan y el contenido largo se recorta con elipsis en vez de
// ensanchar la tabla. Cada juego de pesos suma 100%.
const construirColumnas = defs => defs.map(d => ({
  accessorKey: d.key,
  header: d.title,
  meta: {
    class: {
      // El ancho se declara en el th; con `table-fixed` el td lo hereda.
      th: [d.w, 'px-2', d.align === 'end' ? 'text-right' : ''].filter(Boolean).join(' '),
      // `truncate` recorta con elipsis en lugar de ensanchar la columna.
      td: ['px-2 truncate', d.align === 'end' ? 'text-right' : ''].filter(Boolean).join(' ')
    }
  }
}))

const facColumns = construirColumnas([
  { key: 'estatus', title: 'Estatus', w: 'w-[14%]' },
  { key: 'card_code', title: 'Prov.', w: 'w-[10%]' },
  { key: 'folio_sap', title: 'Folio', w: 'w-[11%]' },
  { key: 'numatcard', title: 'Ref.', w: 'w-[23%]' },
  { key: 'subtotal', title: 'Valor', w: 'w-[14%]', align: 'end' },
  { key: 'abonado', title: 'Recibido', w: 'w-[14%]', align: 'end' },
  { key: 'pendiente', title: 'Pendiente', w: 'w-[14%]', align: 'end' }
])

const ingColumns = construirColumnas([
  { key: 'fecha', title: 'Fecha', w: 'w-[20%]' },
  { key: 'concepto', title: 'Concepto', w: 'w-[42%]' },
  { key: 'monto', title: 'Monto', w: 'w-[18%]', align: 'end' },
  { key: 'acciones', title: '', w: 'w-[20%]', align: 'end' }
])

// Hay filtros activos si se escribió una búsqueda o el estatus no es «Todas».
const hayFiltrosFac = computed(() => filtroEstado.value !== 'Todas' || !!search.value.trim())
const limpiarFiltrosFac = () => {
  filtroEstado.value = 'Todas'
  search.value = ''
}

const countBy = e => facturas.value.filter(f => f.estatus === e).length
const facturasFiltradas = computed(() =>
  filtroEstado.value === 'Todas' ? facturas.value : facturas.value.filter(f => f.estatus === filtroEstado.value))

// La búsqueda la resolvía `:search` del v-data-table; aquí se hace explícita.
const facturasVisibles = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return facturasFiltradas.value
  return facturasFiltradas.value.filter(f =>
    [f.folio_sap, f.numatcard, f.card_name, f.card_code, f.estatus]
      .map(x => String(x ?? '').toLowerCase()).join(' ').includes(q))
})

// Estados de filtro (sin emojis: se usa un punto de color por estatus)
const filtrosEstado = computed(() => [
  { value: 'Todas', label: `Todas (${facturas.value.length})`, dot: '' },
  { value: 'PENDIENTE', label: `Pendientes (${countBy('PENDIENTE')})`, dot: 'bg-error' },
  { value: 'PARCIAL', label: `Parciales (${countBy('PARCIAL')})`, dot: 'bg-warning' },
  { value: 'CONCILIADA', label: `Conciliadas (${countBy('CONCILIADA')})`, dot: 'bg-success' }
])

// Paginación (el v-data-table original usaba 10 y 15 por página)
const FAC_PAGE_SIZE = 15
const ING_PAGE_SIZE = 10
const facPage = ref(1)
const ingPage = ref(1)
const facturasPagina = computed(() => {
  const start = (facPage.value - 1) * FAC_PAGE_SIZE
  return facturasVisibles.value.slice(start, start + FAC_PAGE_SIZE)
})
const ingresosPagina = computed(() => {
  const start = (ingPage.value - 1) * ING_PAGE_SIZE
  return ingresosLibres.value.slice(start, start + ING_PAGE_SIZE)
})
watch([search, filtroEstado], () => { facPage.value = 1 })

const loadFacturas = async () => {
  loadingFac.value = true
  try { facturas.value = (await axios.get('/tesoreria/conciliacion/facturas')).data } catch (e) { notify('Error cargando facturas', 'error') } finally { loadingFac.value = false }
}
const loadIngresos = async () => {
  loadingIng.value = true
  try { ingresosLibres.value = (await axios.get('/tesoreria/conciliacion/ingresos-libres')).data } catch (e) { notify('Error cargando ingresos', 'error') } finally { loadingIng.value = false }
}
const loadAll = async () => { await Promise.all([loadFacturas(), loadIngresos()]); if (selectedFactura.value) await refreshSelected() }

const refreshSelected = async () => {
  const f = facturas.value.find(x => x.docentry === selectedFactura.value.docentry)
  selectedFactura.value = f || selectedFactura.value
  if (selectedFactura.value) {
    abonos.value = (await axios.get(`/tesoreria/conciliacion/factura/${selectedFactura.value.docentry}/abonos`)).data
  }
}

const onRowFactura = async (row) => {
  const f = row?.original ?? row
  selectedFactura.value = f
  try { abonos.value = (await axios.get(`/tesoreria/conciliacion/factura/${f.docentry}/abonos`)).data } catch (e) { abonos.value = [] }
}
const clearSelection = () => { selectedFactura.value = null; abonos.value = [] }

const vincular = async (ingreso) => {
  if (!selectedFactura.value) return
  linkingId.value = ingreso.id
  try {
    await axios.post('/tesoreria/conciliacion', { operacion_id: ingreso.id, docentry: selectedFactura.value.docentry })
    notify('Ingreso vinculado')
    await Promise.all([loadFacturas(), loadIngresos()])
    await refreshSelected()
  } catch (e) { notify(e.response?.data?.message || 'Error al vincular', 'error') } finally { linkingId.value = null }
}

// Confirmación de desvinculación (antes era un window.confirm)
const desvincularDialog = ref({ show: false, abono: null })
const askDesvincular = (a) => { desvincularDialog.value = { show: true, abono: a } }
const desvincular = async (a) => {
  try {
    await axios.delete(`/tesoreria/conciliacion/${a.id}`)
    notify('Ingreso desvinculado')
    await Promise.all([loadFacturas(), loadIngresos()])
    await refreshSelected()
  } catch (e) { notify('Error al desvincular', 'error') }
}
const confirmDesvincular = async () => {
  const a = desvincularDialog.value.abono
  desvincularDialog.value.show = false
  if (a) await desvincular(a)
}

const money = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'
const estatusColor = e => e === 'CONCILIADA' ? 'success' : (e === 'PARCIAL' ? 'warning' : 'error')
const estatusLabel = e => e === 'CONCILIADA' ? 'Conciliada' : (e === 'PARCIAL' ? 'Parcial' : 'Pendiente')

onMounted(loadAll)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo las tablas. -->
  <UDashboardPanel id="tesoreria-conciliacion" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Conciliación">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Buscar factura…"
            class="w-60"
          />
          <UTooltip text="Recargar">
            <UButton
              icon="i-mdi-refresh"
              color="neutral"
              variant="ghost"
              square
              :loading="loadingFac || loadingIng"
              @click="loadAll"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Filtros -->
      <UCard class="mb-3 shrink-0">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-for="f in filtrosEstado"
            :key="f.value"
            size="sm"
            :color="filtroEstado === f.value ? 'primary' : 'neutral'"
            :variant="filtroEstado === f.value ? 'solid' : 'outline'"
            @click="filtroEstado = f.value"
          >
            <span v-if="f.dot" class="size-2 rounded-full" :class="f.dot" />
            {{ f.label }}
          </UButton>
        </div>
      </UCard>

      <!-- En escritorio las dos columnas comparten el alto disponible y cada tabla
           scrollea por dentro; en móvil (columnas apiladas) scrollea la rejilla. -->
      <div class="grid grid-cols-12 gap-4 flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
        <!-- IZQUIERDA: ingresos sin conciliar -->
        <div class="col-span-12 md:col-span-5 min-h-0 flex flex-col">
          <UCard
            class="h-full min-h-0 flex flex-col"
            :ui="{ header: 'shrink-0', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
          >
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-mdi-cash-plus" class="size-5 text-success" />
                <span class="font-semibold text-highlighted">Ingresos sin conciliar</span>
              </div>
            </template>

            <div class="p-3 shrink-0">
              <UAlert
                v-if="!selectedFactura"
                color="info"
                variant="soft"
                description="Selecciona una factura de la derecha para vincularle ingresos."
              />
              <UAlert v-else color="primary" variant="soft">
                <template #description>
                  Vinculando a: <strong>Folio {{ selectedFactura.folio_sap }}</strong>
                </template>
              </UAlert>
            </div>

            <UTable
              :data="ingresosPagina"
              :columns="ingColumns"
              :loading="loadingIng"
              sticky="header"
              class="text-xs flex-1 min-h-0 overflow-y-auto"
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
                    :key="`ing-skel-${i}`"
                    class="flex items-center gap-4 px-2 py-3"
                  >
                    <USkeleton class="h-4 w-20 shrink-0" />
                    <USkeleton class="h-4 flex-1" />
                    <USkeleton class="h-4 w-20 shrink-0" />
                    <USkeleton class="h-7 w-16 shrink-0" />
                  </div>
                </div>
              </template>

              <!-- Vacío: esta tabla no tiene filtros propios, así que el único
                   caso posible es que no queden ingresos por conciliar. -->
              <template #empty>
                <div class="py-12 px-6 text-center">
                  <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                    <UIcon name="i-lucide-inbox" class="size-7 text-primary" />
                  </div>

                  <p class="font-semibold text-highlighted mb-1">
                    No hay ingresos sin conciliar
                  </p>
                  <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                    Todos los ingresos registrados ya están vinculados a una factura de proveedor.
                  </p>

                  <UButton
                    label="Recargar"
                    icon="i-lucide-refresh-cw"
                    color="neutral"
                    variant="subtle"
                    @click="loadIngresos"
                  />
                </div>
              </template>

              <template #fecha-cell="{ row }">
                <span class="block truncate text-muted" :title="fmtDate(row.original.fecha)">{{ fmtDate(row.original.fecha) }}</span>
              </template>
              <template #concepto-cell="{ row }">
                <span class="block truncate" :title="row.original.concepto">{{ row.original.concepto || '—' }}</span>
              </template>
              <template #monto-cell="{ row }">
                <span class="font-bold text-success whitespace-nowrap">{{ money(row.original.monto) }}</span>
              </template>
              <template #acciones-cell="{ row }">
                <UButton
                  size="xs"
                  color="primary"
                  :disabled="!selectedFactura"
                  :loading="linkingId === row.original.id"
                  @click="vincular(row.original)"
                >
                  Vincular
                </UButton>
              </template>
            </UTable>

            <!-- Pie fijo: la paginación queda fuera del área scrolleable. -->
            <div v-if="ingresosLibres.length > ING_PAGE_SIZE" class="flex justify-center p-3 border-t border-default shrink-0">
              <UPagination
                v-model:page="ingPage"
                :items-per-page="ING_PAGE_SIZE"
                :total="ingresosLibres.length"
              />
            </div>
          </UCard>
        </div>

        <!-- DERECHA: facturas de proveedor -->
        <div class="col-span-12 md:col-span-7 min-h-0 flex flex-col">
          <!-- Detalle de la factura seleccionada -->
          <UCard v-if="selectedFactura" class="mb-3 shrink-0">
            <template #header>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-highlighted">
                  Folio {{ selectedFactura.folio_sap }} · {{ selectedFactura.card_code === 'P0148' ? 'Trade' : 'Log' }}
                </span>
                <div class="flex-1" />
                <UBadge :color="estatusColor(selectedFactura.estatus)" variant="solid" class="font-bold">
                  {{ estatusLabel(selectedFactura.estatus) }}
                </UBadge>
                <UButton
                  icon="i-mdi-close"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  square
                  @click="clearSelection"
                />
              </div>
            </template>

            <div class="text-xs text-muted mb-2">
              {{ selectedFactura.card_name }} · Ref {{ selectedFactura.numatcard || '—' }}
            </div>
            <div class="grid grid-cols-12 gap-3 mb-2">
              <div class="col-span-4">
                <div class="text-xs text-muted">
                  Valor
                </div>
                <div class="font-bold text-highlighted">
                  {{ money(selectedFactura.subtotal) }}
                </div>
              </div>
              <div class="col-span-4">
                <div class="text-xs text-muted">
                  Recibido
                </div>
                <div class="text-success">
                  {{ money(selectedFactura.abonado) }}
                </div>
              </div>
              <div class="col-span-4">
                <div class="text-xs text-muted">
                  Pendiente
                </div>
                <div class="text-warning">
                  {{ money(selectedFactura.subtotal - selectedFactura.abonado) }}
                </div>
              </div>
            </div>

            <USeparator class="mb-2" />
            <div class="text-sm font-semibold text-highlighted mb-1">
              Ingresos conciliados
            </div>

            <div v-if="!abonos.length" class="text-center text-muted py-3 text-sm">
              Sin ingresos conciliados
            </div>
            <div
              v-for="a in abonos"
              :key="a.id"
              class="flex items-center gap-3 py-2 border-b border-default last:border-b-0 text-sm"
            >
              <span class="text-muted whitespace-nowrap">{{ fmtDate(a.fecha_operacion || a.fecha) }}</span>
              <span class="flex-1 truncate">{{ a.concepto || '—' }}</span>
              <span class="text-success font-bold whitespace-nowrap">{{ money(a.monto_abonado) }}</span>
              <UTooltip text="Desvincular">
                <UButton
                  icon="i-mdi-link-variant-off"
                  size="xs"
                  variant="ghost"
                  color="error"
                  square
                  @click="askDesvincular(a)"
                />
              </UTooltip>
            </div>
          </UCard>

          <!-- Tabla principal: ocupa el espacio restante y scrollea por dentro. -->
          <UCard
            class="flex-1 min-h-0 flex flex-col"
            :ui="{ header: 'shrink-0', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
          >
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-mdi-file-document-multiple-outline" class="size-5 text-primary" />
                <span class="font-semibold text-highlighted">Facturas de proveedor (Trade / Log)</span>
              </div>
            </template>

            <UTable
              :data="facturasPagina"
              :columns="facColumns"
              :loading="loadingFac"
              sticky="header"
              class="text-xs flex-1 min-h-0 overflow-y-auto"
              :ui="{
                base: 'table-fixed w-full',
                tr: 'cursor-pointer',
                td: 'text-sm py-2',
                th: 'text-xs py-2'
              }"
              @select="(_e, row) => onRowFactura(row)"
            >
              <!-- Carga: filas fantasma en vez de un spinner suelto. -->
              <template #loading>
                <div class="divide-y divide-default">
                  <div
                    v-for="i in 8"
                    :key="`fac-skel-${i}`"
                    class="flex items-center gap-4 px-2 py-3"
                  >
                    <USkeleton class="h-4 w-20 shrink-0" />
                    <USkeleton class="h-4 w-14 shrink-0" />
                    <USkeleton class="h-4 w-16 shrink-0" />
                    <USkeleton class="h-4 flex-1" />
                    <USkeleton class="h-4 w-20 shrink-0" />
                    <USkeleton class="h-4 w-20 shrink-0" />
                  </div>
                </div>
              </template>

              <!-- Vacío: distingue "no hay nada" de "los filtros no dejan ver
                   nada", y ofrece la acción correspondiente en cada caso. -->
              <template #empty>
                <div class="py-12 px-6 text-center">
                  <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                    <UIcon
                      :name="hayFiltrosFac ? 'i-lucide-filter-x' : 'i-lucide-inbox'"
                      class="size-7 text-primary"
                    />
                  </div>

                  <p class="font-semibold text-highlighted mb-1">
                    {{ hayFiltrosFac ? 'Ninguna factura coincide con los filtros' : 'Aún no hay facturas' }}
                  </p>
                  <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                    {{ hayFiltrosFac
                      ? 'Prueba con otro estatus o borra el texto de la búsqueda.'
                      : 'No se encontraron facturas de proveedor (Trade / Log) para conciliar.' }}
                  </p>

                  <UButton
                    v-if="hayFiltrosFac"
                    label="Limpiar filtros"
                    icon="i-lucide-circle-x"
                    color="neutral"
                    variant="subtle"
                    @click="limpiarFiltrosFac"
                  />
                  <UButton
                    v-else
                    label="Recargar"
                    icon="i-lucide-refresh-cw"
                    color="neutral"
                    variant="subtle"
                    @click="loadFacturas"
                  />
                </div>
              </template>

              <template #estatus-cell="{ row }">
                <UBadge
                  :color="estatusColor(row.original.estatus)"
                  size="sm"
                  variant="solid"
                  class="font-bold"
                >
                  {{ estatusLabel(row.original.estatus) }}
                </UBadge>
              </template>
              <template #card_code-cell="{ row }">
                <UBadge size="sm" variant="subtle" :color="row.original.card_code === 'P0148' ? 'primary' : 'info'">
                  {{ row.original.card_code === 'P0148' ? 'Trade' : 'Log' }}
                </UBadge>
              </template>
              <template #numatcard-cell="{ row }">
                <span class="block truncate" :title="row.original.numatcard">{{ row.original.numatcard || '—' }}</span>
              </template>
              <template #subtotal-cell="{ row }">
                <span class="whitespace-nowrap">{{ money(row.original.subtotal) }}</span>
              </template>
              <template #abonado-cell="{ row }">
                <span class="whitespace-nowrap" :class="row.original.abonado > 0 ? 'text-success' : 'text-muted'">
                  {{ money(row.original.abonado) }}
                </span>
              </template>
              <template #pendiente-cell="{ row }">
                <strong class="whitespace-nowrap" :class="row.original.pendiente > 0 ? 'text-warning' : 'text-success'">
                  {{ money(row.original.pendiente) }}
                </strong>
              </template>
            </UTable>

            <!-- Pie fijo: la paginación queda fuera del área scrolleable. -->
            <div v-if="facturasVisibles.length > FAC_PAGE_SIZE" class="flex justify-center p-3 border-t border-default shrink-0">
              <UPagination
                v-model:page="facPage"
                :items-per-page="FAC_PAGE_SIZE"
                :total="facturasVisibles.length"
              />
            </div>
          </UCard>
        </div>
      </div>

      <!-- Confirmación de desvinculación -->
      <UModal v-model:open="desvincularDialog.show" title="¿Desvincular este ingreso de la factura?">
        <template #body>
          <p class="text-muted text-sm">
            El ingreso quedará disponible de nuevo para conciliarse con otra factura.
          </p>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="desvincularDialog.show = false">
              Cancelar
            </UButton>
            <UButton color="error" @click="confirmDesvincular">
              Desvincular
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
