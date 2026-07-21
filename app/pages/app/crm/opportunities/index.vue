<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from '~/utils/axios'
import { stageColors } from '~/config/crmStages'

const router = useRouter()
const loading = ref(false)
const opportunities = ref([])
const search = ref('')

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis en lugar de
// ensanchar la tabla. Mismo criterio que el pipeline.
const headers = [
  { key: 'OpportunityID', title: 'ID', w: 'w-[6%]' },
  { key: 'Name', title: 'Nombre', w: 'w-[19%]' },
  { key: 'CustomerName', title: 'Cliente', w: 'w-[20%]' },
  { key: 'Etapa', title: 'Etapa', w: 'w-[12%]' },
  { key: 'QuoteCount', title: 'Cotizaciones', align: 'center', w: 'w-[8%]' },
  { key: 'SumaMonto', title: 'Suma cotizaciones', align: 'end', w: 'w-[12%]' },
  { key: 'TotalMonto', title: 'Valor Oportunidad', align: 'end', w: 'w-[12%]' },
  { key: 'FechaCierre', title: 'Fecha Cierre', align: 'center', w: 'w-[6%]' },
  { key: 'UpdatedAt', title: 'Actualizado', align: 'center', w: 'w-[5%]' }
]

const columns = headers.map((hdr) => {
  const align = hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
  return {
    id: hdr.key,
    accessorKey: hdr.key,
    header: hdr.title,
    meta: {
      class: {
        // El ancho se declara en el th; con `table-fixed` el td lo hereda.
        // El `truncate` del th es imprescindible: sin él, un título largo en una
        // columna estrecha impone su ancho mínimo y desborda la tabla.
        th: [hdr.w, 'px-2 truncate', align].filter(Boolean).join(' '),
        // `truncate` recorta con elipsis en vez de ensanchar la columna.
        td: ['px-2 truncate', align].filter(Boolean).join(' ')
      }
    }
  }
})

// Distingue la primera carga (mostramos esqueletos) de las recargas, para que
// los indicadores no parpadeen al refrescar.
const cargaInicial = computed(() => loading.value && !opportunities.value.length)

// El único filtro de esta vista es la búsqueda por texto.
const hayFiltros = computed(() => !!search.value)

const limpiarFiltros = () => { search.value = '' }

const filteredOpps = computed(() => {
  if (!search.value) return opportunities.value
  const s = search.value.toLowerCase()
  return opportunities.value.filter(o =>
    (o.Name || '').toLowerCase().includes(s)
    || (o.CustomerName || '').toLowerCase().includes(s)
    || String(o.OpportunityID).includes(s)
  )
})

const totalAggregate = computed(() => filteredOpps.value.reduce((a, o) => a + (o.TotalMonto || 0), 0))

const fetchOpportunities = async () => {
  loading.value = true
  try {
    const res = await axios.get('/crm/opportunities')
    opportunities.value = res.data
  } catch (e) {
    console.error('Error cargando oportunidades', e)
  } finally {
    loading.value = false
  }
}

const formatCurrency = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const formatDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—'

const openDetail = item => router.push(`/app/crm/opportunities/${item.OpportunityID}`)

onMounted(fetchOpportunities)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="crm-opportunities" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Oportunidades" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-mdi-refresh"
            color="primary"
            :loading="loading"
            @click="fetchOpportunities"
          >
            Actualizar
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-muted mb-4">
        Cotizaciones consolidadas por cliente
      </p>

      <div class="grid grid-cols-12 gap-4 mb-4">
        <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al filtrar -->
        <template v-if="cargaInicial">
          <UCard
            v-for="i in 2"
            :key="`kpi-skel-${i}`"
            class="col-span-12 sm:col-span-6 md:col-span-3"
          >
            <div class="text-center">
              <USkeleton class="h-3 w-28 mx-auto mb-2" />
              <USkeleton class="h-7 w-24 mx-auto" />
            </div>
          </UCard>
        </template>

        <template v-else>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Total Oportunidades
              </div>
              <div class="text-2xl font-bold text-primary">
                {{ filteredOpps.length }}
              </div>
            </div>
          </UCard>
          <UCard class="col-span-12 sm:col-span-6 md:col-span-3">
            <div class="text-center">
              <div class="text-xs uppercase tracking-wide text-muted">
                Monto Acumulado
              </div>
              <div class="text-2xl font-bold text-success">
                {{ formatCurrency(totalAggregate) }}
              </div>
            </div>
          </UCard>
        </template>
      </div>

      <!-- La tarjeta ocupa el espacio restante y es la única que scrollea por
           dentro: los indicadores y el buscador quedan siempre a la vista. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col', header: 'shrink-0' }"
      >
        <template #header>
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Buscar (ID, nombre, cliente)"
            class="w-full"
          />
        </template>

        <UTable
          :data="filteredOpps"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="cursor-pointer flex-1 min-h-0 overflow-y-auto"
          :ui="{
            base: 'table-fixed w-full',
            td: 'text-sm py-2',
            th: 'text-xs py-2'
          }"
          @select="(_e, row) => openDetail(row.original)"
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
                <USkeleton class="h-4 w-10 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-16 shrink-0" />
              </div>
            </div>
          </template>

          <!-- Vacío: distingue "no hay nada" de "la búsqueda no deja ver nada",
               y ofrece la acción correspondiente en cada caso. -->
          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon
                  :name="hayFiltros ? 'i-lucide-filter-x' : 'i-lucide-inbox'"
                  class="size-7 text-primary"
                />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                {{ hayFiltros ? 'Ninguna oportunidad coincide con la búsqueda' : 'Aún no hay oportunidades' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba con otro término o limpia la búsqueda.'
                  : 'Las oportunidades se crean al agrupar cotizaciones de un mismo cliente desde el pipeline.' }}
              </p>

              <UButton
                v-if="hayFiltros"
                label="Limpiar búsqueda"
                icon="i-lucide-circle-x"
                color="neutral"
                variant="subtle"
                @click="limpiarFiltros"
              />
              <UButton
                v-else
                label="Recargar"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="subtle"
                @click="fetchOpportunities"
              />
            </div>
          </template>

          <template #OpportunityID-cell="{ row }">
            <span class="font-bold text-primary">#{{ row.original.OpportunityID }}</span>
          </template>
          <template #Name-cell="{ row }">
            <span class="block truncate" :title="row.original.Name">
              {{ row.original.Name }}
            </span>
          </template>
          <template #CustomerName-cell="{ row }">
            <span class="block truncate" :title="row.original.CustomerName">
              {{ row.original.CustomerName }}
            </span>
          </template>
          <template #Etapa-cell="{ row }">
            <UBadge
              :color="stageColors[row.original.Etapa] || 'neutral'"
              variant="subtle"
              size="sm"
              class="font-semibold"
            >
              {{ row.original.Etapa }}
            </UBadge>
          </template>
          <template #QuoteCount-cell="{ row }">
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ row.original.QuoteCount }}
            </UBadge>
          </template>
          <template #SumaMonto-cell="{ row }">
            <span class="text-muted">{{ formatCurrency(row.original.SumaMonto) }}</span>
          </template>
          <template #TotalMonto-cell="{ row }">
            <span class="font-semibold text-primary">{{ formatCurrency(row.original.TotalMonto) }}</span>
          </template>
          <template #FechaCierre-cell="{ row }">
            {{ formatDate(row.original.FechaCierre) }}
          </template>
          <template #UpdatedAt-cell="{ row }">
            <span class="text-xs text-muted">{{ formatDate(row.original.UpdatedAt) }}</span>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
