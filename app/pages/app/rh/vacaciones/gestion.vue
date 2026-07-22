<script setup>
// RH > Gestión de Vacaciones.
//
// Pantalla de administración: la plantilla completa con su saldo, y al entrar
// a una persona, todo lo suyo — datos, periodos y movimientos — editable.
//
// El acceso no se controla aquí sino desde los permisos del menú, así que
// basta con quitar la entrada a un perfil para que deje de verla.
import axios from '~/utils/axios'
import { fechaCorta, aValorInput } from '~/utils/fechas'

const toast = useToast()

const empleados = ref([])
const catalogos = ref({ jefes: [], tipos: [], estatus: [] })
const cargando = ref(false)
const errorCarga = ref('')

const cargaInicial = computed(() => cargando.value && !empleados.value.length)

const mensajeError = (e, r) => e?.response?.data?.message || e?.message || r
const avisarError = (e, r) => toast.add({ title: mensajeError(e, r), color: 'error', icon: 'i-mdi-alert-circle-outline' })
const avisarExito = t => toast.add({ title: t, color: 'success', icon: 'i-mdi-check-circle-outline' })

// --- Tipos de movimiento ----------------------------------------------------
// Un solo lugar define etiqueta, color e icono. Las clases van escritas
// completas porque Tailwind no genera las que se arman por interpolación.
const TIPOS = {
  VACATION: { etiqueta: 'Vacaciones', color: 'primary', icono: 'i-mdi-beach' },
  PERMIT_3H: { etiqueta: 'Permiso 3 h', color: 'info', icono: 'i-mdi-clock-outline' },
  PERMIT_5H: { etiqueta: 'Permiso 5 h', color: 'info', icono: 'i-mdi-clock-outline' },
  PERMIT_DAY: { etiqueta: 'Permiso día', color: 'warning', icono: 'i-mdi-calendar-remove-outline' },
  CASH_OUT: { etiqueta: 'Canje', color: 'success', icono: 'i-mdi-cash-multiple' }
}
const metaTipo = t => TIPOS[t] || { etiqueta: t, color: 'neutral', icono: 'i-mdi-help-circle-outline' }

const ESTATUS = {
  APPROVED: { etiqueta: 'Autorizada', color: 'success' },
  PENDING: { etiqueta: 'Pendiente', color: 'warning' },
  REJECTED: { etiqueta: 'Rechazada', color: 'error' }
}
const metaEstatus = e => ESTATUS[e] || { etiqueta: e, color: 'neutral' }

// --- Formato ----------------------------------------------------------------
// Las fechas de este modulo son columnas DATE, sin hora. Se formatean con el
// utilitario compartido, que las arma en hora local a partir del texto: pasarlas
// por `new Date()` las convertia desde medianoche UTC y las mostraba un dia
// antes de la que esta guardada.
const fecha = fechaCorta
const aInput = aValorInput

// El saldo se colorea por umbral: en rojo cuando está sobregirado, en ámbar
// cuando queda poco. Es el dato que se busca de un vistazo.
const claseSaldo = (s) => {
  const n = Number(s)
  if (n < 0) return 'text-error'
  if (n <= 3) return 'text-warning'
  return 'text-success'
}

const claseVence = (d) => {
  const n = Number(d)
  if (n <= 30) return 'text-error'
  if (n <= 90) return 'text-warning'
  return 'text-muted'
}

// --- Carga ------------------------------------------------------------------
const cargar = async () => {
  cargando.value = true
  errorCarga.value = ''
  try {
    const [e, c] = await Promise.all([
      axios.get('/rh/gestion-vacaciones/empleados'),
      axios.get('/rh/gestion-vacaciones/catalogos')
    ])
    empleados.value = e.data || []
    catalogos.value = {
      jefes: c.data?.jefes || [],
      tipos: c.data?.tipos || [],
      estatus: c.data?.estatus || []
    }
  } catch (error) {
    errorCarga.value = mensajeError(error, 'No se pudo cargar la plantilla.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

// --- Indicadores ------------------------------------------------------------
const indicadores = computed(() => {
  const l = empleados.value
  return {
    total: l.length,
    sobregirados: l.filter(e => Number(e.Saldo) < 0).length,
    porVencer: l.filter(e => e.DiasParaVencer !== null && Number(e.DiasParaVencer) <= 30).length,
    pendientes: l.reduce((s, e) => s + (Number(e.Pendientes) || 0), 0)
  }
})

// --- Búsqueda y filtros -----------------------------------------------------
const normalizar = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const busqueda = ref('')
const filtroDepto = ref([])
const soloSobregirados = ref(false)
const soloPorVencer = ref(false)

const departamentos = computed(() =>
  [...new Set(empleados.value.map(e => e.Department).filter(Boolean))].sort()
)

const filtrados = computed(() => {
  const q = normalizar(busqueda.value).trim()
  const terminos = q ? q.split(/\s+/) : []
  return empleados.value.filter((e) => {
    if (filtroDepto.value.length && !filtroDepto.value.includes(e.Department)) return false
    if (soloSobregirados.value && Number(e.Saldo) >= 0) return false
    if (soloPorVencer.value && !(e.DiasParaVencer !== null && Number(e.DiasParaVencer) <= 30)) return false
    const texto = normalizar([e.NombreCompleto, e.Email, e.JobTitle, e.Department, e.JefeNombre].filter(Boolean).join(' '))
    return terminos.every(t => texto.includes(t))
  })
})

const hayFiltros = computed(() =>
  !!busqueda.value.trim() || filtroDepto.value.length > 0 || soloSobregirados.value || soloPorVencer.value
)

const limpiarFiltros = () => {
  busqueda.value = ''
  filtroDepto.value = []
  soloSobregirados.value = false
  soloPorVencer.value = false
}

// `w` es el peso en porcentaje. Con `table-fixed` el ancho se declara en el th
// y el td lo hereda, así la tabla siempre cabe sin scroll horizontal.
const COLUMNAS = [
  { accessorKey: 'NombreCompleto', header: 'Empleado', meta: { class: { th: 'w-[26%]', td: 'w-[26%]' } } },
  { accessorKey: 'EntryDate', header: 'Ingreso', meta: { class: { th: 'w-[13%]', td: 'w-[13%]' } } },
  { accessorKey: 'NumeroPeriodo', header: 'Periodo', meta: { class: { th: 'w-[17%]', td: 'w-[17%]' } } },
  { accessorKey: 'DiasDerecho', header: 'Derecho', meta: { class: { th: 'w-[9%]', td: 'w-[9%]' } } },
  { accessorKey: 'DiasUsados', header: 'Consumido', meta: { class: { th: 'w-[14%]', td: 'w-[14%]' } } },
  { accessorKey: 'Saldo', header: 'Saldo', meta: { class: { th: 'w-[10%]', td: 'w-[10%]' } } },
  { id: 'acciones', header: '', meta: { class: { th: 'w-[11%]', td: 'w-[11%]' } } }
]

// --- Detalle ----------------------------------------------------------------
const panel = ref(false)
const detalle = ref(null)
const cargandoDetalle = ref(false)

const abrirDetalle = async (id) => {
  panel.value = true
  cargandoDetalle.value = true
  detalle.value = null
  try {
    const r = await axios.get(`/rh/gestion-vacaciones/empleados/${id}`)
    detalle.value = r.data
  } catch (error) {
    avisarError(error, 'No se pudo cargar el empleado')
    panel.value = false
  } finally {
    cargandoDetalle.value = false
  }
}

const recargarDetalle = async () => {
  if (!detalle.value) return
  const id = detalle.value.empleado.EmployeeID
  const [d] = await Promise.all([
    axios.get(`/rh/gestion-vacaciones/empleados/${id}`),
    cargar()
  ])
  detalle.value = d.data
}

const periodoVigente = computed(() => detalle.value?.periodos?.find(p => p.EsVigente) || null)

// --- Edición del empleado ---------------------------------------------------
const modalEmpleado = ref(false)
const guardandoEmpleado = ref(false)
const formEmpleado = ref({})

const abrirEdicionEmpleado = () => {
  const e = detalle.value.empleado
  formEmpleado.value = {
    FirstName: e.FirstName || '',
    LastName: e.LastName || '',
    Email: e.Email || '',
    JobTitle: e.JobTitle || '',
    Department: e.Department || '',
    EntryDate: aInput(e.EntryDate),
    ManagerID: e.ManagerID ?? null
  }
  modalEmpleado.value = true
}

const ingresoCambia = computed(() =>
  detalle.value && formEmpleado.value.EntryDate
  && formEmpleado.value.EntryDate !== aInput(detalle.value.empleado.EntryDate)
)

const opcionesJefe = computed(() =>
  catalogos.value.jefes
    .filter(j => j.EmployeeID !== detalle.value?.empleado?.EmployeeID)
    .map(j => ({ label: j.Nombre, descripcion: j.JobTitle, value: j.EmployeeID }))
)

const guardarEmpleado = async () => {
  if (!formEmpleado.value.FirstName?.trim()) {
    toast.add({ title: 'El nombre es obligatorio', color: 'warning', icon: 'i-mdi-alert-outline' })
    return
  }
  guardandoEmpleado.value = true
  try {
    const r = await axios.put(
      `/rh/gestion-vacaciones/empleados/${detalle.value.empleado.EmployeeID}`,
      formEmpleado.value
    )
    avisarExito(r.data?.periodosRegenerados
      ? 'Empleado actualizado. Se recalcularon sus periodos.'
      : 'Empleado actualizado')
    modalEmpleado.value = false
    await recargarDetalle()
  } catch (error) {
    avisarError(error, 'No se pudo actualizar el empleado')
  } finally {
    guardandoEmpleado.value = false
  }
}

// --- Movimientos ------------------------------------------------------------
const modalMovimiento = ref(false)
const guardandoMovimiento = ref(false)
const movimientoEditado = ref(null)

const formVacio = () => ({
  RequestType: 'VACATION',
  StartDate: '',
  EndDate: '',
  DaysQuantity: null,
  Reason: '',
  Status: 'APPROVED'
})

const formMovimiento = ref(formVacio())

const abrirAltaMovimiento = () => {
  movimientoEditado.value = null
  formMovimiento.value = formVacio()
  modalMovimiento.value = true
}

const abrirEdicionMovimiento = (s) => {
  movimientoEditado.value = s
  formMovimiento.value = {
    RequestType: s.RequestType,
    StartDate: aInput(s.StartDate),
    EndDate: aInput(s.EndDate),
    DaysQuantity: s.DaysQuantity,
    Reason: s.Reason || '',
    Status: s.Status
  }
  modalMovimiento.value = true
}

const esPermiso = computed(() => formMovimiento.value.RequestType?.startsWith('PERMIT'))
const esCanje = computed(() => formMovimiento.value.RequestType === 'CASH_OUT')

// Lo que va a descontar, calculado igual que en el servidor. Se muestra antes
// de guardar para que no haya sorpresas en el saldo.
const descuentoPrevisto = computed(() => {
  const f = formMovimiento.value
  if (f.Status !== 'APPROVED') return 0
  const fijos = { PERMIT_3H: 0.3, PERMIT_5H: 0.5, PERMIT_DAY: 1 }
  if (f.RequestType in fijos) return fijos[f.RequestType]
  if (f.RequestType === 'CASH_OUT') return Number(f.DaysQuantity) || 0
  if (!f.StartDate) return 0
  const a = new Date(f.StartDate)
  const b = new Date(f.EndDate || f.StartDate)
  return Math.round(Math.abs(b - a) / 86400000) + 1
})

const guardarMovimiento = async () => {
  const f = formMovimiento.value
  if (!f.StartDate) {
    toast.add({ title: 'La fecha de inicio es obligatoria', color: 'warning', icon: 'i-mdi-alert-outline' })
    return
  }
  if (esCanje.value && !Number(f.DaysQuantity)) {
    toast.add({ title: 'Indica cuántos días se canjean', color: 'warning', icon: 'i-mdi-alert-outline' })
    return
  }

  guardandoMovimiento.value = true
  try {
    if (movimientoEditado.value) {
      await axios.put(`/rh/gestion-vacaciones/solicitudes/${movimientoEditado.value.RequestID}`, f)
      avisarExito('Movimiento actualizado')
    } else {
      await axios.post(`/rh/gestion-vacaciones/empleados/${detalle.value.empleado.EmployeeID}/solicitudes`, f)
      avisarExito('Movimiento registrado')
    }
    modalMovimiento.value = false
    await recargarDetalle()
  } catch (error) {
    avisarError(error, 'No se pudo guardar el movimiento')
  } finally {
    guardandoMovimiento.value = false
  }
}

const eliminarMovimiento = async (s) => {
  const t = metaTipo(s.RequestType).etiqueta
  if (!confirm(`¿Eliminar el movimiento de ${t} del ${fecha(s.StartDate)}? Esta acción no se puede deshacer.`)) return
  try {
    await axios.delete(`/rh/gestion-vacaciones/solicitudes/${s.RequestID}`)
    avisarExito('Movimiento eliminado')
    await recargarDetalle()
  } catch (error) {
    avisarError(error, 'No se pudo eliminar el movimiento')
  }
}

// --- Ajuste de días del periodo ---------------------------------------------
const modalPeriodo = ref(false)
const guardandoPeriodo = ref(false)
const periodoEditado = ref(null)
const formPeriodo = ref({ DiasDerecho: 0, Notas: '' })

const abrirAjustePeriodo = (p) => {
  periodoEditado.value = p
  formPeriodo.value = { DiasDerecho: p.DiasDerecho, Notas: p.Notas || '' }
  modalPeriodo.value = true
}

const guardarPeriodo = async () => {
  guardandoPeriodo.value = true
  try {
    await axios.put(`/rh/gestion-vacaciones/periodos/${periodoEditado.value.PeriodoID}`, formPeriodo.value)
    avisarExito('Días del periodo ajustados')
    modalPeriodo.value = false
    await recargarDetalle()
  } catch (error) {
    avisarError(error, 'No se pudo ajustar el periodo')
  } finally {
    guardandoPeriodo.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="gestion-vacaciones">
    <template #header>
      <UDashboardNavbar title="Gestión de Vacaciones" icon="i-mdi-account-clock-outline">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-mdi-refresh"
            color="neutral"
            variant="ghost"
            :loading="cargando"
            aria-label="Actualizar"
            @click="cargar"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="errorCarga"
        color="error"
        variant="subtle"
        icon="i-mdi-alert-circle-outline"
        :title="errorCarga"
        class="mb-4"
      >
        <template #actions>
          <UButton label="Reintentar" color="error" variant="outline" size="xs" @click="cargar" />
        </template>
      </UAlert>

      <!-- Indicadores sobre el total, no sobre lo filtrado: son el panorama
           del área, no el resultado de la búsqueda. -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <template v-if="cargaInicial">
          <UCard v-for="n in 4" :key="n" :ui="{ body: 'p-4' }">
            <USkeleton class="h-3 w-24 mb-3" />
            <USkeleton class="h-8 w-12" />
          </UCard>
        </template>
        <template v-else>
          <UCard :ui="{ body: 'p-4' }">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-mdi-account-group-outline" class="size-4 text-primary" />
              <span class="text-xs uppercase tracking-wide text-muted">Plantilla</span>
            </div>
            <div class="text-3xl font-bold text-highlighted">{{ indicadores.total }}</div>
          </UCard>
          <UCard :ui="{ body: 'p-4' }">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-mdi-alert-octagon-outline" class="size-4 text-error" />
              <span class="text-xs uppercase tracking-wide text-muted">Sobregirados</span>
            </div>
            <div class="text-3xl font-bold" :class="indicadores.sobregirados ? 'text-error' : 'text-highlighted'">
              {{ indicadores.sobregirados }}
            </div>
          </UCard>
          <UCard :ui="{ body: 'p-4' }">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-mdi-timer-sand" class="size-4 text-warning" />
              <span class="text-xs uppercase tracking-wide text-muted">Vencen en 30 días</span>
            </div>
            <div class="text-3xl font-bold" :class="indicadores.porVencer ? 'text-warning' : 'text-highlighted'">
              {{ indicadores.porVencer }}
            </div>
          </UCard>
          <UCard :ui="{ body: 'p-4' }">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-mdi-clock-alert-outline" class="size-4 text-info" />
              <span class="text-xs uppercase tracking-wide text-muted">Por autorizar</span>
            </div>
            <div class="text-3xl font-bold text-highlighted">{{ indicadores.pendientes }}</div>
          </UCard>
        </template>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-highlighted">Plantilla</h2>
            <UBadge color="neutral" variant="subtle" size="sm">{{ filtrados.length }}</UBadge>

            <div class="flex-1" />

            <UInput
              v-model="busqueda"
              icon="i-mdi-magnify"
              placeholder="Buscar persona..."
              class="w-full sm:w-56"
            />
            <USelectMenu
              v-model="filtroDepto"
              :items="departamentos"
              multiple
              placeholder="Área"
              icon="i-mdi-office-building-outline"
              class="w-40"
            />
            <UButton
              label="Sobregirados"
              icon="i-mdi-alert-octagon-outline"
              size="sm"
              :color="soloSobregirados ? 'error' : 'neutral'"
              :variant="soloSobregirados ? 'solid' : 'outline'"
              @click="soloSobregirados = !soloSobregirados"
            />
            <UButton
              label="Por vencer"
              icon="i-mdi-timer-sand"
              size="sm"
              :color="soloPorVencer ? 'warning' : 'neutral'"
              :variant="soloPorVencer ? 'solid' : 'outline'"
              @click="soloPorVencer = !soloPorVencer"
            />
            <UButton
              v-if="hayFiltros"
              label="Limpiar"
              icon="i-mdi-filter-remove-outline"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="limpiarFiltros"
            />
          </div>
        </template>

        <!-- El scroll vive en el contenedor de la tabla, no en la página: el
             encabezado y los filtros quedan fijos al recorrer. -->
        <div class="overflow-auto" style="max-height: 34rem">
          <UTable
            :data="filtrados"
            :columns="COLUMNAS"
            :loading="cargaInicial"
            :ui="{ base: 'table-fixed w-full', td: 'py-2', th: 'py-2' }"
            class="w-full"
            @select="(_e, row) => abrirDetalle(row.original.EmployeeID)"
          >
            <template #loading>
              <div class="p-3 space-y-3">
                <div v-for="n in 6" :key="n" class="flex items-center gap-3">
                  <USkeleton class="size-8 rounded-full shrink-0" />
                  <USkeleton class="h-4 flex-1" />
                  <USkeleton class="h-4 w-20 shrink-0" />
                  <USkeleton class="h-4 w-32 shrink-0" />
                  <USkeleton class="h-4 w-16 shrink-0" />
                </div>
              </div>
            </template>

            <template #empty>
              <div class="py-10 text-center">
                <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                  <UIcon
                    :name="hayFiltros ? 'i-mdi-filter-remove-outline' : 'i-mdi-account-group-outline'"
                    class="size-7 text-primary"
                  />
                </div>
                <p class="font-medium text-highlighted">
                  {{ hayFiltros ? 'Nadie coincide con los filtros' : 'No hay empleados registrados' }}
                </p>
                <UButton
                  v-if="hayFiltros"
                  label="Limpiar filtros"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="mt-4"
                  @click="limpiarFiltros"
                />
              </div>
            </template>

            <template #NombreCompleto-cell="{ row }">
              <div class="flex items-center gap-2 min-w-0">
                <UAvatar
                  :src="row.original.Avatar || undefined"
                  :alt="row.original.NombreCompleto"
                  size="sm"
                  class="shrink-0"
                />
                <div class="min-w-0">
                  <div class="truncate text-highlighted font-medium">{{ row.original.NombreCompleto }}</div>
                  <div class="text-xs text-muted truncate">
                    {{ row.original.JobTitle || 'Sin puesto' }}
                  </div>
                </div>
              </div>
            </template>

            <template #EntryDate-cell="{ row }">
              <span class="text-sm">{{ fecha(row.original.EntryDate) }}</span>
            </template>

            <template #NumeroPeriodo-cell="{ row }">
              <div v-if="row.original.NumeroPeriodo" class="min-w-0">
                <div class="text-sm text-highlighted">Año {{ row.original.NumeroPeriodo }}</div>
                <div class="text-xs truncate" :class="claseVence(row.original.DiasParaVencer)">
                  vence en {{ row.original.DiasParaVencer }} d
                </div>
              </div>
              <span v-else class="text-xs text-muted">Sin periodo</span>
            </template>

            <template #DiasDerecho-cell="{ row }">
              <span class="text-sm font-medium">{{ row.original.DiasDerecho ?? '—' }}</span>
            </template>

            <template #DiasUsados-cell="{ row }">
              <div class="text-xs text-muted">
                <span class="text-highlighted font-medium">{{ row.original.DiasUsados }}</span> tomados
                <template v-if="row.original.DiasProgramados > 0">
                  · {{ row.original.DiasProgramados }} prog.
                </template>
                <template v-if="row.original.DiasCanjeados > 0">
                  · {{ row.original.DiasCanjeados }} canje
                </template>
              </div>
            </template>

            <template #Saldo-cell="{ row }">
              <span class="text-lg font-bold" :class="claseSaldo(row.original.Saldo)">
                {{ row.original.Saldo }}
              </span>
            </template>

            <template #acciones-cell="{ row }">
              <UButton
                label="Gestionar"
                icon="i-mdi-cog-outline"
                color="neutral"
                variant="subtle"
                size="xs"
                @click.stop="abrirDetalle(row.original.EmployeeID)"
              />
            </template>
          </UTable>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>

  <!-- Detalle del empleado -->
  <USlideover
    v-model:open="panel"
    :title="detalle?.empleado?.NombreCompleto || 'Empleado'"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div v-if="cargandoDetalle" class="space-y-4">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <div v-else-if="detalle" class="space-y-5">
        <!-- Ficha -->
        <UCard :ui="{ body: 'p-4' }">
          <div class="flex items-start gap-4">
            <UAvatar
              :src="detalle.empleado.Avatar || undefined"
              :alt="detalle.empleado.NombreCompleto"
              size="xl"
              class="shrink-0"
            />
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-highlighted truncate">
                {{ detalle.empleado.NombreCompleto }}
              </h3>
              <p class="text-sm text-muted truncate">
                {{ detalle.empleado.JobTitle || 'Sin puesto' }}
                <template v-if="detalle.empleado.Department"> · {{ detalle.empleado.Department }}</template>
              </p>
              <dl class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div class="flex gap-2">
                  <dt class="text-muted">Ingreso:</dt>
                  <dd class="text-highlighted font-medium">{{ fecha(detalle.empleado.EntryDate) }}</dd>
                </div>
                <div class="flex gap-2">
                  <dt class="text-muted">Jefe:</dt>
                  <dd class="text-highlighted">{{ detalle.empleado.JefeNombre || 'Sin asignar' }}</dd>
                </div>
                <div class="flex gap-2 sm:col-span-2 min-w-0">
                  <dt class="text-muted shrink-0">Correo:</dt>
                  <dd class="text-highlighted truncate">{{ detalle.empleado.Email }}</dd>
                </div>
              </dl>
            </div>
            <UButton
              icon="i-mdi-pencil-outline"
              color="neutral"
              variant="subtle"
              size="sm"
              label="Editar"
              class="shrink-0"
              @click="abrirEdicionEmpleado"
            />
          </div>
        </UCard>

        <!-- Saldo del periodo vigente -->
        <UCard v-if="periodoVigente" :ui="{ body: 'p-4' }">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h4 class="font-semibold text-highlighted">
                Periodo vigente · año {{ periodoVigente.NumeroPeriodo }}
              </h4>
              <p class="text-xs text-muted">
                {{ fecha(periodoVigente.FechaInicio) }} al {{ fecha(periodoVigente.FechaFin) }}
              </p>
            </div>
            <UButton
              label="Ajustar días"
              icon="i-mdi-tune-variant"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="abrirAjustePeriodo(periodoVigente)"
            />
          </div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="rounded-lg bg-elevated p-3">
              <div class="text-xs uppercase tracking-wide text-muted mb-1">Derecho</div>
              <div class="text-2xl font-bold text-highlighted">{{ periodoVigente.DiasDerecho }}</div>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <div class="text-xs uppercase tracking-wide text-muted mb-1">Consumido</div>
              <div class="text-2xl font-bold text-highlighted">{{ periodoVigente.Consumido }}</div>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <div class="text-xs uppercase tracking-wide text-muted mb-1">Saldo</div>
              <div class="text-2xl font-bold" :class="claseSaldo(periodoVigente.Saldo)">
                {{ periodoVigente.Saldo }}
              </div>
            </div>
          </div>
          <UAlert
            v-if="Number(periodoVigente.Saldo) < 0"
            color="error"
            variant="subtle"
            icon="i-mdi-alert-octagon-outline"
            class="mt-3"
            title="Sobregirado"
            :description="`Tomó ${Math.abs(Number(periodoVigente.Saldo))} días más de los que le corresponden en este periodo.`"
          />
          <p v-if="periodoVigente.Notas" class="mt-3 text-xs text-muted">
            {{ periodoVigente.Notas }}
          </p>
        </UCard>

        <!-- Historial de periodos -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <h4 class="font-semibold text-highlighted">Periodos</h4>
          </template>
          <div class="overflow-auto" style="max-height: 14rem">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 sticky top-0">
                <tr class="text-xs uppercase tracking-wide text-muted">
                  <th class="text-left font-medium px-4 py-2">Año</th>
                  <th class="text-left font-medium px-4 py-2">Vigencia</th>
                  <th class="text-right font-medium px-4 py-2">Derecho</th>
                  <th class="text-right font-medium px-4 py-2">Consumido</th>
                  <th class="text-right font-medium px-4 py-2">Saldo</th>
                  <th class="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in detalle.periodos"
                  :key="p.PeriodoID"
                  class="border-t border-default"
                  :class="p.EsVigente ? 'bg-primary/5' : ''"
                >
                  <td class="px-4 py-2">
                    <span class="font-medium text-highlighted">{{ p.NumeroPeriodo }}</span>
                    <UBadge v-if="p.EsVigente" color="primary" variant="subtle" size="xs" class="ml-2">
                      vigente
                    </UBadge>
                  </td>
                  <td class="px-4 py-2 text-muted text-xs">
                    {{ fecha(p.FechaInicio) }} — {{ fecha(p.FechaFin) }}
                  </td>
                  <td class="px-4 py-2 text-right">{{ p.DiasDerecho }}</td>
                  <td class="px-4 py-2 text-right">{{ p.Consumido }}</td>
                  <td class="px-4 py-2 text-right font-semibold" :class="claseSaldo(p.Saldo)">
                    {{ p.Saldo }}
                  </td>
                  <td class="px-4 py-2 text-right">
                    <UButton
                      icon="i-mdi-tune-variant"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Ajustar días"
                      @click="abrirAjustePeriodo(p)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <!-- Movimientos -->
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="font-semibold text-highlighted">Movimientos</h4>
              <UBadge color="neutral" variant="subtle" size="sm">
                {{ detalle.solicitudes.length }}
              </UBadge>
              <div class="flex-1" />
              <UButton
                label="Registrar"
                icon="i-mdi-plus"
                size="sm"
                @click="abrirAltaMovimiento"
              />
            </div>
          </template>

          <div v-if="!detalle.solicitudes.length" class="py-10 text-center">
            <div class="mx-auto flex items-center justify-center size-12 rounded-full bg-primary/10 mb-3">
              <UIcon name="i-mdi-calendar-blank-outline" class="size-6 text-primary" />
            </div>
            <p class="text-sm font-medium text-highlighted">Sin movimientos registrados</p>
            <p class="text-xs text-muted mt-1">
              Aquí aparecen sus vacaciones, permisos y canjes.
            </p>
          </div>

          <div v-else class="overflow-auto" style="max-height: 22rem">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 sticky top-0">
                <tr class="text-xs uppercase tracking-wide text-muted">
                  <th class="text-left font-medium px-4 py-2">Tipo</th>
                  <th class="text-left font-medium px-4 py-2">Fechas</th>
                  <th class="text-right font-medium px-4 py-2">Descuenta</th>
                  <th class="text-left font-medium px-4 py-2">Periodo</th>
                  <th class="text-left font-medium px-4 py-2">Estatus</th>
                  <th class="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in detalle.solicitudes" :key="s.RequestID" class="border-t border-default">
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <UIcon :name="metaTipo(s.RequestType).icono" class="size-4 shrink-0 text-muted" />
                      <span class="truncate">{{ metaTipo(s.RequestType).etiqueta }}</span>
                    </div>
                    <div v-if="s.Reason" class="text-xs text-muted truncate mt-0.5">{{ s.Reason }}</div>
                  </td>
                  <td class="px-4 py-2 text-xs">
                    {{ fecha(s.StartDate) }}
                    <template v-if="s.EndDate && aInput(s.EndDate) !== aInput(s.StartDate)">
                      <br>al {{ fecha(s.EndDate) }}
                    </template>
                  </td>
                  <td class="px-4 py-2 text-right font-medium">
                    {{ s.DeductionValue }}
                  </td>
                  <td class="px-4 py-2 text-xs text-muted">
                    {{ s.NumeroPeriodo ? 'Año ' + s.NumeroPeriodo : '—' }}
                  </td>
                  <td class="px-4 py-2">
                    <UBadge :color="metaEstatus(s.Status).color" variant="subtle" size="xs">
                      {{ metaEstatus(s.Status).etiqueta }}
                    </UBadge>
                  </td>
                  <td class="px-4 py-2">
                    <div class="flex justify-end gap-1">
                      <UButton
                        icon="i-mdi-pencil-outline"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        aria-label="Editar"
                        @click="abrirEdicionMovimiento(s)"
                      />
                      <UButton
                        icon="i-mdi-trash-can-outline"
                        color="error"
                        variant="ghost"
                        size="xs"
                        aria-label="Eliminar"
                        @click="eliminarMovimiento(s)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </template>
  </USlideover>

  <!-- Editar empleado -->
  <UModal v-model:open="modalEmpleado" title="Editar empleado">
    <template #body>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Nombre" required>
          <UInput v-model="formEmpleado.FirstName" class="w-full" />
        </UFormField>
        <UFormField label="Apellidos">
          <UInput v-model="formEmpleado.LastName" class="w-full" />
        </UFormField>
        <UFormField label="Correo" class="sm:col-span-2">
          <UInput v-model="formEmpleado.Email" type="email" class="w-full" />
        </UFormField>
        <UFormField label="Puesto">
          <UInput v-model="formEmpleado.JobTitle" class="w-full" />
        </UFormField>
        <UFormField label="Área">
          <UInput v-model="formEmpleado.Department" class="w-full" />
        </UFormField>
        <UFormField label="Jefe directo" class="sm:col-span-2">
          <USelectMenu
            v-model="formEmpleado.ManagerID"
            :items="opcionesJefe"
            value-key="value"
            placeholder="Sin asignar"
            :search-input="{ placeholder: 'Buscar persona...' }"
            icon="i-mdi-account-tie-outline"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Fecha de ingreso" class="sm:col-span-2">
          <UInput v-model="formEmpleado.EntryDate" type="date" class="w-full" />
        </UFormField>

        <!-- La fecha de ingreso define los aniversarios, así que moverla
             recalcula todos los periodos y vuelve a atribuir el historial. -->
        <UAlert
          v-if="ingresoCambia"
          color="warning"
          variant="subtle"
          icon="i-mdi-alert-outline"
          class="sm:col-span-2"
          title="Se recalcularán los periodos"
          description="La fecha de ingreso define los aniversarios. Al cambiarla se regeneran todos los periodos y cada movimiento se reasigna al que le corresponda, así que los saldos van a moverse."
        />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="modalEmpleado = false" />
        <UButton label="Guardar" icon="i-mdi-check" :loading="guardandoEmpleado" @click="guardarEmpleado" />
      </div>
    </template>
  </UModal>

  <!-- Alta / edición de movimiento -->
  <UModal
    v-model:open="modalMovimiento"
    :title="movimientoEditado ? 'Editar movimiento' : 'Registrar movimiento'"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Tipo" required>
          <USelectMenu
            v-model="formMovimiento.RequestType"
            :items="catalogos.tipos"
            value-key="valor"
            label-key="etiqueta"
            icon="i-mdi-shape-outline"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField :label="esPermiso || esCanje ? 'Fecha' : 'Del'" required>
            <UInput v-model="formMovimiento.StartDate" type="date" class="w-full" />
          </UFormField>
          <UFormField v-if="!esPermiso && !esCanje" label="Al">
            <UInput v-model="formMovimiento.EndDate" type="date" class="w-full" />
          </UFormField>
          <UFormField v-if="esCanje" label="Días a canjear" required>
            <UInput v-model="formMovimiento.DaysQuantity" type="number" min="0" step="0.5" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Estatus">
          <USelectMenu
            v-model="formMovimiento.Status"
            :items="catalogos.estatus"
            value-key="valor"
            label-key="etiqueta"
            icon="i-mdi-progress-check"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Motivo">
          <UTextarea v-model="formMovimiento.Reason" :rows="2" class="w-full" />
        </UFormField>

        <!-- Se muestra el descuento antes de guardar: es lo que va a mover el
             saldo, y calcularlo mentalmente para un permiso es fuente de error. -->
        <div class="flex items-center justify-between rounded-lg border border-default px-3 py-2.5">
          <div>
            <div class="text-sm font-medium text-highlighted">Descontará del saldo</div>
            <p class="text-xs text-muted">
              {{ formMovimiento.Status === 'APPROVED'
                ? 'Sólo las autorizadas consumen días.'
                : 'Al no estar autorizada, no consume días.' }}
            </p>
          </div>
          <span class="text-2xl font-bold" :class="descuentoPrevisto > 0 ? 'text-primary' : 'text-muted'">
            {{ descuentoPrevisto }}
          </span>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="modalMovimiento = false" />
        <UButton
          :label="movimientoEditado ? 'Guardar' : 'Registrar'"
          icon="i-mdi-check"
          :loading="guardandoMovimiento"
          @click="guardarMovimiento"
        />
      </div>
    </template>
  </UModal>

  <!-- Ajuste de días del periodo -->
  <UModal
    v-model:open="modalPeriodo"
    :title="`Ajustar días · año ${periodoEditado?.NumeroPeriodo ?? ''}`"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Los días salen del tabulador de ley según la antigüedad. Ajústalos sólo
          para casos que la tabla no cubre: un acuerdo particular, días de
          cortesía o corregir un arrastre.
        </p>
        <UFormField label="Días de derecho" required>
          <UInput v-model="formPeriodo.DiasDerecho" type="number" min="0" step="0.5" class="w-full" />
        </UFormField>
        <UFormField label="Motivo del ajuste" help="Queda registrado en el periodo.">
          <UTextarea v-model="formPeriodo.Notas" :rows="2" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="modalPeriodo = false" />
        <UButton label="Guardar" icon="i-mdi-check" :loading="guardandoPeriodo" @click="guardarPeriodo" />
      </div>
    </template>
  </UModal>
</template>
