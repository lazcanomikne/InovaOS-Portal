<script setup>
// Conteo de Efectivo (tesorería).
// Migrado desde views/tesoreria/ConteoEfectivo.vue (Vuetify 3).
import { useAuthStore } from '~/stores/auth'
import axios from '~/utils/axios'

const authStore = useAuthStore()
const toast = useToast()

const items = ref([])
const loading = ref(false)
const saving = ref(false)
const notify = (text, color = 'success') => { toast.add({ title: text, color }) }

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el contenido largo se recorta con elipsis en vez de
// ensanchar la tabla. Los pesos suman 100%.
const columns = [
  { key: 'fecha', title: 'Fecha', w: 'w-[15%]' },
  { key: 'card_code', title: 'Prov.', w: 'w-[8%]' },
  { key: 'folio_sap', title: 'Folio', w: 'w-[9%]' },
  { key: 'numatcard', title: 'Referencia', w: 'w-[16%]' },
  { key: 'concepto', title: 'Concepto', w: 'w-[26%]' },
  { key: 'monto', title: 'Monto', w: 'w-[13%]', align: 'end' },
  { key: 'acciones', title: 'Acción', w: 'w-[13%]', align: 'end' }
].map(d => ({
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

const totalPorContar = computed(() => items.value.reduce((a, i) => a + Number(i.monto || 0), 0))

// Distingue la primera carga (mostramos esqueletos) de las recargas posteriores
// (mantenemos los datos visibles para que la pantalla no parpadee).
const cargaInicial = computed(() => loading.value && !items.value.length)

const load = async () => {
  loading.value = true
  try { items.value = (await axios.get('/tesoreria/conteo-efectivo')).data } catch (e) { notify('Error cargando conteo', 'error') } finally { loading.value = false }
}

const dlg = ref({ show: false, item: null, montoContado: 0 })
const cuadra = computed(() => dlg.value.item && Number(dlg.value.montoContado) === Number(dlg.value.item.monto))
const openContar = (item) => { dlg.value = { show: true, item, montoContado: Number(item.monto) } }

const confirmarContado = async () => {
  saving.value = true
  try {
    await axios.post(`/tesoreria/conteo-efectivo/${dlg.value.item.id}/contar`, {
      monto_contado: dlg.value.montoContado,
      usuario: authStore.user?.name || 'Usuario'
    })
    notify(cuadra.value ? 'Efectivo contado (cuadra)' : 'Efectivo contado (con diferencia)')
    dlg.value.show = false
    await load()
  } catch (e) { notify('Error al marcar contado', 'error') } finally { saving.value = false }
}

const money = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

onMounted(load)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="tesoreria-conteo-efectivo" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Conteo de Efectivo">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
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
      <div class="grid grid-cols-12 gap-3 mb-4 shrink-0">
        <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al recargar -->
        <template v-if="cargaInicial">
          <div v-for="i in 2" :key="`kpi-skel-${i}`" class="col-span-12 sm:col-span-6">
            <UCard :ui="{ body: 'py-4' }">
              <div class="flex items-center gap-4">
                <USkeleton class="size-10 rounded-full shrink-0" />
                <div class="flex-1">
                  <USkeleton class="h-5 w-28 mb-2" />
                  <USkeleton class="h-3 w-20" />
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <template v-else>
          <div class="col-span-12 sm:col-span-6">
            <UCard :ui="{ body: 'py-4' }">
              <div class="flex items-center gap-4">
                <UAvatar icon="i-mdi-cash-clock" size="lg" class="bg-warning/10 text-warning" />
                <div>
                  <div class="text-xl font-bold text-highlighted">
                    {{ items.length }}
                  </div>
                  <div class="text-xs text-muted">
                    Ingresos por contar
                  </div>
                </div>
              </div>
            </UCard>
          </div>
          <div class="col-span-12 sm:col-span-6">
            <UCard :ui="{ body: 'py-4' }">
              <div class="flex items-center gap-4">
                <UAvatar icon="i-mdi-cash-multiple" size="lg" class="bg-info/10 text-info" />
                <div>
                  <div class="text-xl font-bold text-highlighted">
                    {{ money(totalPorContar) }}
                  </div>
                  <div class="text-xs text-muted">
                    Total por contar
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </template>
      </div>

      <!-- La tarjeta ocupa el espacio restante; sólo la tabla scrollea. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ header: 'shrink-0', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-mdi-hand-coin-outline" class="size-5 text-primary" />
            <span class="font-semibold text-highlighted">
              Abonos por factura al sobre «Sergio» pendientes de contar
            </span>
          </div>
        </template>

        <UTable
          :data="items"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="flex-1 min-h-0 overflow-y-auto"
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
                <USkeleton class="h-4 w-14 shrink-0" />
                <USkeleton class="h-4 w-16 shrink-0" />
                <USkeleton class="h-4 w-32 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-7 w-20 shrink-0" />
              </div>
            </div>
          </template>

          <!-- Vacío: la pantalla no tiene filtros (siempre muestra lo pendiente
               de contar), así que el único caso posible es que no haya nada. -->
          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon name="i-lucide-inbox" class="size-7 text-primary" />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                No hay ingresos pendientes de contar
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                Todos los abonos por factura al sobre «Sergio» ya fueron contados.
              </p>

              <UButton
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
          <template #numatcard-cell="{ row }">
            <span class="block truncate" :title="row.original.numatcard">{{ row.original.numatcard || '—' }}</span>
          </template>
          <template #concepto-cell="{ row }">
            <span class="block truncate" :title="row.original.concepto">{{ row.original.concepto || '—' }}</span>
          </template>
          <template #card_code-cell="{ row }">
            <UBadge size="sm" variant="subtle" :color="row.original.card_code === 'P0148' ? 'primary' : 'info'">
              {{ row.original.card_code === 'P0148' ? 'Trade' : 'Log' }}
            </UBadge>
          </template>
          <template #monto-cell="{ row }">
            <span class="font-bold text-success whitespace-nowrap">{{ money(row.original.monto) }}</span>
          </template>
          <template #acciones-cell="{ row }">
            <UButton
              size="sm"
              color="success"
              icon="i-mdi-cash-check"
              @click="openContar(row.original)"
            >
              Contar
            </UButton>
          </template>
        </UTable>
      </UCard>

      <!-- Modal contar -->
      <UModal
        v-model:open="dlg.show"
        title="Contar efectivo"
        :dismissible="false"
        :ui="{ content: 'max-w-md' }"
      >
        <template #body>
          <div v-if="dlg.item" class="space-y-3">
            <div class="text-xs text-muted">
              Folio {{ dlg.item.folio_sap }} · Ref {{ dlg.item.numatcard || '—' }}
            </div>
            <div>{{ dlg.item.concepto }}</div>
            <div class="flex justify-between items-center">
              <span class="text-muted">Monto ingresado</span>
              <strong class="text-lg text-highlighted">{{ money(dlg.item.monto) }}</strong>
            </div>

            <UFormField label="Monto contado ($)">
              <UInput
                v-model.number="dlg.montoContado"
                type="number"
                autofocus
                class="w-full"
              >
                <template #leading>
                  <span class="text-muted text-sm">$</span>
                </template>
              </UInput>
            </UFormField>

            <UAlert :color="cuadra ? 'success' : 'warning'" variant="soft">
              <template #description>
                <template v-if="cuadra">
                  El monto contado <strong>cuadra</strong> con lo ingresado.
                </template>
                <template v-else>
                  Diferencia de <strong>{{ money(dlg.montoContado - dlg.item.monto) }}</strong> respecto a lo
                  ingresado. Se marcará contado de todas formas.
                </template>
              </template>
            </UAlert>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="dlg.show = false">
              Cancelar
            </UButton>
            <UButton color="success" :loading="saving" @click="confirmarContado">
              Marcar como contado
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
