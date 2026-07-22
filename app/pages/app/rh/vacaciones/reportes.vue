<script setup>
// Reportes de Ausencias: filtros, tabla de resultados y exportación a Excel/PDF.
import { ref, computed, onMounted } from 'vue'
import axios from '~/utils/axios'
import * as XLSX from 'xlsx' // Importar librería Excel
import jsPDF from 'jspdf' // Importar librería PDF
import autoTable from 'jspdf-autotable' // Plugin tablas PDF
import { aFechaLocal } from '~/utils/fechas'

const toast = useToast()

const panelOpen = ref(0)
const loading = ref(false)

const employeesList = ref([])
const reportData = ref([])

const filters = ref({
  requestType: 'Todos',
  employeeId: null,
  startDate: null,
  endDate: null
})

const tiposSolicitud = ['Todos', 'Vacaciones', 'Permisos', 'Canjes']

// --- API Calls ---
const loadEmployees = async () => {
  try {
    const res = await axios.get('/rh/employees-list')
    employeesList.value = res.data
  } catch (e) {
    console.error(e)
  }
}

const generateReport = async () => {
  loading.value = true
  try {
    const res = await axios.post('/rh/reports/generate', filters.value)
    reportData.value = res.data
    panelOpen.value = null // Cerrar acordeón al buscar
  } catch (e) {
    console.error(e)
    toast.add({ title: 'Error generando reporte', color: 'error' })
  } finally {
    loading.value = false
  }
}

const clearFilters = () => {
  filters.value = { requestType: 'Todos', employeeId: null, startDate: null, endDate: null }
  reportData.value = []
}

// --- EXPORTAR EXCEL ---
const exportToExcel = () => {
  // 1. Mapear datos para que el Excel sea legible (no códigos)
  const dataForExcel = reportData.value.map(item => ({
    Folio: item.RequestID,
    Empleado: item.FullName,
    Departamento: item.Department,
    Tipo: getTypeLabel(item.RequestType),
    Detalle: formatDurationPrecise(item), // Usar la función precisa
    Inicio: formatDateShort(item.StartDate),
    Fin: formatDateShort(item.EndDate),
    Estado: getStatusLabel(item.Status),
    Motivo: item.Reason
  }))

  // 2. Crear Hoja y Libro
  const ws = XLSX.utils.json_to_sheet(dataForExcel)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Ausencias')

  // 3. Descargar
  XLSX.writeFile(wb, `Reporte_Ausencias_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// --- EXPORTAR PDF ---
const exportToPDF = () => {
  const doc = new jsPDF()

  // Título
  doc.setFontSize(18)
  doc.text('Reporte de Ausencias', 14, 20)
  doc.setFontSize(10)
  doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 28)

  // Definir columnas y filas
  const tableColumn = ['Folio', 'Empleado', 'Depto', 'Tipo', 'Detalle', 'Fechas', 'Estado']
  const tableRows = []

  reportData.value.forEach((item) => {
    const rowData = [
      item.RequestID,
      item.FullName,
      item.Department,
      getTypeLabel(item.RequestType),
      formatDurationPrecise(item),
      `${formatDateShort(item.StartDate)} - ${formatDateShort(item.EndDate)}`,
      getStatusLabel(item.Status)
    ]
    tableRows.push(rowData)
  })

  // Generar Tabla
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [21, 101, 192] } // Azul corporativo
  })

  doc.save(`Reporte_Ausencias_${new Date().toISOString().slice(0, 10)}.pdf`)
}

// --- HELPERS (Formato Preciso) ---

// Función clave para mostrar "3 Horas", "5 Días", etc.
const formatDurationPrecise = (item) => {
  if (item.RequestType === 'PERMIT_3H') return '3 Horas'
  if (item.RequestType === 'PERMIT_5H') return '5 Horas'

  // Si es día completo o vacaciones
  const days = item.DaysQuantity
  if (days === 1) return '1 Día'
  if (days % 1 !== 0) return `${days} Días (Parcial)` // Por si acaso
  return `${days} Días`
}

const getTypeLabel = (type) => {
  if (type === 'VACATION') return 'Vacaciones'
  if (type && type.includes('PERMIT')) return 'Permiso'
  return 'Canje Efectivo'
}
const getTypeColor = (type) => {
  if (type === 'VACATION') return 'primary'
  if (type && type.includes('PERMIT')) return 'info'
  return 'success'
}
const getStatusLabel = (status) => {
  const map = { APPROVED: 'Autorizado', REJECTED: 'Rechazado', PENDING: 'Pendiente', CANCELLED: 'Cancelado' }
  return map[status] || status
}
const getStatusColor = (status) => {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'error'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}
const formatDateShort = (d) => {
  if (!d) return '-'
  const f = aFechaLocal(d)
  return f ? f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'
}

// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis en lugar de
// ensanchar la tabla. Mismo criterio que el pipeline.
const headers = [
  { key: 'RequestID', title: 'Folio', w: 'w-[8%]' },
  { key: 'FullName', title: 'Empleado', w: 'w-[30%]' }, // Incluye Depto visualmente
  { key: 'RequestType', title: 'Tipo', w: 'w-[13%]' },
  { key: 'DaysQuantity', title: 'Detalle/Duración', w: 'w-[17%]' }, // Columna Precisa
  { key: 'StartDate', title: 'Inicio', align: 'center', w: 'w-[10%]' },
  { key: 'EndDate', title: 'Fin', align: 'center', w: 'w-[10%]' },
  { key: 'Status', title: 'Estado', w: 'w-[12%]' }
]

const columns = headers.map((hdr) => {
  const align = hdr.align === 'center' ? 'text-center' : ''
  return {
    id: hdr.key,
    accessorKey: hdr.key,
    header: hdr.title,
    meta: {
      class: {
        // El ancho se declara en el th; con `table-fixed` el td lo hereda.
        th: [hdr.w, 'px-2 truncate', align].filter(Boolean).join(' '),
        // `truncate` recorta con elipsis en vez de ensanchar la columna.
        td: ['px-2 truncate', align].filter(Boolean).join(' ')
      }
    }
  }
})

// Filtros activos: el tipo por omisión ("Todos") no cuenta como filtro.
const hayFiltros = computed(() =>
  filters.value.requestType !== 'Todos'
  || filters.value.employeeId !== null
  || !!filters.value.startDate
  || !!filters.value.endDate
)

onMounted(() => {
  loadEmployees()
})
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="rh-reportes-ausencias" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Reportes de Ausencias">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div v-if="reportData.length > 0" class="flex gap-2">
            <UButton
              color="success"
              icon="i-mdi-microsoft-excel"
              @click="exportToExcel"
            >
              Excel
            </UButton>
            <UButton
              color="error"
              icon="i-mdi-file-pdf-box"
              @click="exportToPDF"
            >
              PDF
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Filtros: franja fija, no se comprime -->
      <UCard class="mb-6 shrink-0">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-mdi-filter-variant" class="size-5 text-primary" />
            <span class="font-semibold text-highlighted">Filtros de Búsqueda</span>
          </div>
        </template>

        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="Tipo de Solicitud" class="w-50">
            <USelect
              v-model="filters.requestType"
              :items="tiposSolicitud"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Buscar Empleado" class="w-64">
            <USelectMenu
              v-model="filters.employeeId"
              :items="employeesList"
              label-key="FullName"
              value-key="EmployeeID"
              placeholder="Todos"
              class="w-full"
            >
              <template #empty>
                No encontrado
              </template>
            </USelectMenu>
          </UFormField>

          <UFormField label="Desde" class="w-40">
            <UInput v-model="filters.startDate" type="date" class="w-full" />
          </UFormField>

          <UFormField label="Hasta" class="w-40">
            <UInput v-model="filters.endDate" type="date" class="w-full" />
          </UFormField>

          <div class="flex gap-2 ml-auto">
            <UButton color="neutral" variant="ghost" @click="clearFilters">
              Limpiar
            </UButton>
            <UButton
              color="primary"
              icon="i-mdi-magnify"
              :loading="loading"
              @click="generateReport"
            >
              Generar Reporte
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Resultados: ocupa el espacio restante y es lo único que scrollea -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ header: 'shrink-0', body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <template #header>
          <span class="text-sm font-semibold text-highlighted">
            Resultados encontrados: <span class="text-primary">{{ reportData.length }}</span>
          </span>
        </template>

        <UTable
          :data="reportData"
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
                <USkeleton class="h-4 w-12 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-4 w-28 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-20 shrink-0" />
              </div>
            </div>
          </template>

          <!-- Vacío: distingue "los filtros no arrojaron nada" de "todavía no se
               ha generado un reporte", con la acción que toca en cada caso. -->
          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon
                  :name="hayFiltros ? 'i-lucide-filter-x' : 'i-lucide-file-search'"
                  class="size-7 text-primary"
                />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                {{ hayFiltros ? 'Ninguna ausencia coincide con los filtros' : 'Sin reporte generado' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba ampliando el rango de fechas o quitando algún filtro.'
                  : 'Selecciona los filtros de búsqueda y genera un reporte para ver resultados.' }}
              </p>

              <UButton
                v-if="hayFiltros"
                label="Limpiar filtros"
                icon="i-lucide-circle-x"
                color="neutral"
                variant="subtle"
                @click="clearFilters"
              />
              <UButton
                v-else
                label="Generar reporte"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="subtle"
                @click="generateReport"
              />
            </div>
          </template>

          <template #FullName-cell="{ row }">
            <div class="py-2 min-w-0">
              <div class="font-bold text-highlighted truncate" :title="row.original.FullName">
                {{ row.original.FullName }}
              </div>
              <div class="text-xs text-muted truncate" :title="row.original.Department">
                {{ row.original.Department }}
              </div>
            </div>
          </template>

          <template #RequestType-cell="{ row }">
            <UBadge
              size="sm"
              :color="getTypeColor(row.original.RequestType)"
              variant="solid"
              class="font-bold"
            >
              {{ getTypeLabel(row.original.RequestType) }}
            </UBadge>
          </template>

          <template #DaysQuantity-cell="{ row }">
            <div class="text-sm font-medium text-highlighted">
              {{ formatDurationPrecise(row.original) }}
            </div>
          </template>

          <template #StartDate-cell="{ row }">
            <span class="text-muted">{{ formatDateShort(row.original.StartDate) }}</span>
          </template>

          <template #EndDate-cell="{ row }">
            <span class="text-muted">{{ formatDateShort(row.original.EndDate) }}</span>
          </template>

          <template #Status-cell="{ row }">
            <UBadge
              size="sm"
              :color="getStatusColor(row.original.Status)"
              variant="subtle"
              class="font-bold"
            >
              {{ getStatusLabel(row.original.Status) }}
            </UBadge>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
