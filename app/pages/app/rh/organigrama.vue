<script setup>
// Organigrama: diagrama jerárquico de la empresa construido a partir de ManagerID.
// Esta jerarquía es la que usa el flujo de autorización de vacaciones, por eso la
// vista es de sólo lectura salvo que el backend devuelva `puedeEditar`.
import { ref, computed, onMounted, nextTick } from 'vue'
import axios from '~/utils/axios'
import { useAuthStore } from '~/stores/auth'

const toast = useToast()
const authStore = useAuthStore()

const empleados = ref([])
const puedeEditar = ref(false)
const cargando = ref(false)
const errorCarga = ref('')

// Distingue la primera carga (esqueletos) de las recargas posteriores, para que
// el diagrama no parpadee después de cada operación de edición.
const cargaInicial = computed(() => cargando.value && !empleados.value.length)

const modoEdicion = ref(false)
const busqueda = ref('')

// Alto efectivo del nodo: crece en modo edición para alojar la fila de acciones.
const ALTO_NODO = computed(() => (puedeEditar.value && modoEdicion.value)
  ? ALTO_NODO_EDICION
  : ALTO_NODO_BASE)

// Correo del usuario en sesión: sirve para resaltar su tarjeta dentro del árbol.
const correoActual = computed(() => (authStore.user?.email || '').trim().toLowerCase())

// --- Geometría del diagrama -------------------------------------------------
// Todas las tarjetas miden lo mismo, así el cálculo de posiciones se reduce a
// repartir columnas de ancho fijo y centrar a cada jefe sobre sus subordinados.
const ANCHO_NODO = 236
// La tarjeta gana una fila de acciones en modo edicion, asi que el alto del
// nodo cambia con el modo. Si no creciera, el contenido se desbordaria sobre
// los conectores.
const ALTO_NODO_BASE = 108
const ALTO_NODO_EDICION = 148
const SEPARACION_X = 28
const SEPARACION_Y = 68

// --- Construcción del árbol -------------------------------------------------
// Se indexa por EmployeeID y se agrupan los hijos por ManagerID. Son raíces los
// empleados sin jefe o cuyo jefe no viene en el listado. Si el backend llegara a
// entregar un ciclo, los nodos que quedaran fuera del recorrido se promueven a
// raíz para que nunca desaparezcan de la pantalla ni provoquen recursión infinita.
const arbol = computed(() => {
  const porId = new Map()
  for (const e of empleados.value) {
    porId.set(e.EmployeeID, { datos: e, hijos: [] })
  }

  const raices = []
  for (const nodo of porId.values()) {
    const jefe = nodo.datos.ManagerID != null ? porId.get(nodo.datos.ManagerID) : null
    if (jefe && jefe !== nodo) jefe.hijos.push(nodo)
    else raices.push(nodo)
  }

  const ordenar = lista => lista.sort((a, b) =>
    (a.datos.FullName || '').localeCompare(b.datos.FullName || '', 'es')
  )
  ordenar(raices)
  for (const nodo of porId.values()) ordenar(nodo.hijos)

  // Rescate de ciclos: lo que no se alcanza desde las raíces se agrega aparte.
  const visitados = new Set()
  const marcar = (nodo) => {
    if (visitados.has(nodo.datos.EmployeeID)) return
    visitados.add(nodo.datos.EmployeeID)
    nodo.hijos.forEach(marcar)
  }
  raices.forEach(marcar)
  for (const nodo of porId.values()) {
    if (!visitados.has(nodo.datos.EmployeeID)) {
      raices.push(nodo)
      marcar(nodo)
    }
  }

  return raices
})

// --- Plegado de ramas -------------------------------------------------------
// Se guardan los IDs colapsados; por omisión todo arranca desplegado.
const colapsados = ref([])
const estaColapsado = id => colapsados.value.includes(id)

const alternarRama = (id) => {
  colapsados.value = estaColapsado(id)
    ? colapsados.value.filter(x => x !== id)
    : [...colapsados.value, id]
}

// Total de descendientes, para avisar cuántas personas esconde una rama plegada.
const descendientes = computed(() => {
  const mapa = new Map()
  const contar = (nodo) => {
    let total = 0
    for (const hijo of nodo.hijos) total += 1 + contar(hijo)
    mapa.set(nodo.datos.EmployeeID, total)
    return total
  }
  arbol.value.forEach(contar)
  return mapa
})

const totalDescendientes = id => descendientes.value.get(id) || 0

const conHijos = computed(() => {
  const conjunto = new Set()
  const recorrer = (nodo) => {
    if (nodo.hijos.length) conjunto.add(nodo.datos.EmployeeID)
    nodo.hijos.forEach(recorrer)
  }
  arbol.value.forEach(recorrer)
  return conjunto
})

const colapsarTodo = () => {
  colapsados.value = [...conHijos.value]
}
const expandirTodo = () => {
  colapsados.value = []
}

// --- Cálculo de posiciones --------------------------------------------------
// Recorrido en profundidad: las hojas se van acomodando de izquierda a derecha
// con un cursor y cada jefe se centra entre su primer y su último hijo visible.
// Devuelve las tarjetas con coordenadas absolutas y las líneas que las unen.
const disposicion = computed(() => {
  const nodos = []
  const aristas = []
  let cursorX = 0

  const ubicar = (nodo, nivel) => {
    const y = nivel * (ALTO_NODO.value + SEPARACION_Y)
    const plegado = estaColapsado(nodo.datos.EmployeeID)
    const hijosVisibles = plegado ? [] : nodo.hijos

    let x
    if (!hijosVisibles.length) {
      x = cursorX
      cursorX += ANCHO_NODO + SEPARACION_X
    } else {
      const posiciones = hijosVisibles.map(h => ubicar(h, nivel + 1))
      x = (posiciones[0] + posiciones[posiciones.length - 1]) / 2
    }

    nodos.push({
      id: nodo.datos.EmployeeID,
      datos: nodo.datos,
      x,
      y,
      nivel,
      tieneHijos: nodo.hijos.length > 0,
      plegado
    })

    // Conector en codo: baja del jefe, gira a la altura media y baja al hijo.
    if (hijosVisibles.length) {
      const centroJefe = x + ANCHO_NODO / 2
      const baseJefe = y + ALTO_NODO.value
      const medio = baseJefe + SEPARACION_Y / 2
      const topeHijo = y + ALTO_NODO.value + SEPARACION_Y

      for (const hijo of hijosVisibles) {
        const nodoHijo = nodos.find(n => n.id === hijo.datos.EmployeeID)
        if (!nodoHijo) continue
        const centroHijo = nodoHijo.x + ANCHO_NODO / 2
        const distancia = Math.abs(centroHijo - centroJefe)

        if (distancia < 1) {
          aristas.push({ id: `${nodo.datos.EmployeeID}-${hijo.datos.EmployeeID}`, d: `M ${centroJefe} ${baseJefe} V ${topeHijo}` })
          continue
        }

        const sentido = centroHijo > centroJefe ? 1 : -1
        const radio = Math.min(14, distancia / 2, SEPARACION_Y / 2)
        aristas.push({
          id: `${nodo.datos.EmployeeID}-${hijo.datos.EmployeeID}`,
          d: [
            `M ${centroJefe} ${baseJefe}`,
            `V ${medio - radio}`,
            `Q ${centroJefe} ${medio} ${centroJefe + sentido * radio} ${medio}`,
            `H ${centroHijo - sentido * radio}`,
            `Q ${centroHijo} ${medio} ${centroHijo} ${medio + radio}`,
            `V ${topeHijo}`
          ].join(' ')
        })
      }
    }

    return x
  }

  arbol.value.forEach(raiz => ubicar(raiz, 0))

  const ancho = nodos.length ? Math.max(...nodos.map(n => n.x)) + ANCHO_NODO : 0
  const alto = nodos.length ? Math.max(...nodos.map(n => n.y)) + ALTO_NODO.value : 0

  return { nodos, aristas, ancho, alto }
})

// --- Búsqueda ---------------------------------------------------------------
// No filtra el árbol (rompería la jerarquía): atenúa lo que no coincide para que
// la persona buscada resalte sin perder el contexto de dónde está colgada.
const coincide = (empleado) => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return true
  return [empleado.FullName, empleado.JobTitle, empleado.Department, empleado.Email]
    .some(v => String(v ?? '').toLowerCase().includes(q))
}

const hayBusqueda = computed(() => !!busqueda.value.trim())

const esUsuarioActual = empleado =>
  !!correoActual.value && String(empleado.Email || '').trim().toLowerCase() === correoActual.value

// --- Zoom -------------------------------------------------------------------
// El lienzo se escala con `transform`, y el contenedor exterior toma el tamaño
// ya escalado para que el scroll horizontal siga siendo correcto.
const zoom = ref(1)
const contenedor = ref(null)

const acercar = () => { zoom.value = Math.min(1.6, Math.round((zoom.value + 0.1) * 10) / 10) }
const alejar = () => { zoom.value = Math.max(0.4, Math.round((zoom.value - 0.1) * 10) / 10) }
const zoomOriginal = () => { zoom.value = 1 }

const ajustarAlAncho = async () => {
  await nextTick()
  const disponible = contenedor.value?.clientWidth || 0
  const ancho = disposicion.value.ancho
  if (!disponible || !ancho) return
  zoom.value = Math.max(0.4, Math.min(1, (disponible - 48) / ancho))
}

// --- Métricas ---------------------------------------------------------------
const metricas = computed(() => ({
  total: empleados.value.length,
  sinPuesto: empleados.value.filter(e => !String(e.JobTitle || '').trim()).length,
  sinJefe: empleados.value.filter(e => e.ManagerID == null).length
}))

// --- Carga de datos ---------------------------------------------------------
const mensajeError = (error, respaldo) =>
  error?.response?.data?.message || error?.message || respaldo

const cargar = async () => {
  cargando.value = true
  errorCarga.value = ''
  try {
    const res = await axios.get('/rh/organigrama')
    empleados.value = res.data?.empleados || []
    puedeEditar.value = !!res.data?.puedeEditar
    if (!puedeEditar.value) modoEdicion.value = false
    // Se descartan los IDs plegados que ya no existen tras una edición.
    const vigentes = new Set(empleados.value.map(e => e.EmployeeID))
    colapsados.value = colapsados.value.filter(id => vigentes.has(id))
  } catch (error) {
    console.error('Error al cargar el organigrama:', error)
    errorCarga.value = mensajeError(error, 'No se pudo cargar el organigrama.')
    toast.add({
      title: 'Error al cargar el organigrama',
      description: errorCarga.value,
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    cargando.value = false
  }
}

// --- Opciones de los formularios --------------------------------------------
const usuariosDisponibles = ref([])
const cargandoUsuarios = ref(false)

const cargarUsuariosDisponibles = async () => {
  cargandoUsuarios.value = true
  try {
    const res = await axios.get('/rh/organigrama/usuarios-disponibles')
    usuariosDisponibles.value = res.data || []
  } catch (error) {
    console.error('Error al cargar usuarios disponibles:', error)
    usuariosDisponibles.value = []
    toast.add({
      title: 'No se pudieron cargar los usuarios disponibles',
      description: mensajeError(error, 'Intenta de nuevo en un momento.'),
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    cargandoUsuarios.value = false
  }
}

const opcionesUsuario = computed(() => usuariosDisponibles.value.map(u => ({
  label: u.FullName || u.Email,
  descripcion: [u.Email, u.RoleName].filter(Boolean).join(' · '),
  value: u.Email
})))

// El valor 0 representa "sin jefe": USelectMenu no maneja bien `null` como valor.
const SIN_JEFE = 0

// `excluir` evita ofrecer como jefe a la persona que se está editando.
const opcionesJefe = (excluir = null) => [
  { label: 'Sin jefe directo (raíz del organigrama)', descripcion: 'Reporta a nadie', value: SIN_JEFE },
  ...empleados.value
    .filter(e => e.EmployeeID !== excluir)
    .map(e => ({
      label: e.FullName || e.Email,
      descripcion: [e.JobTitle, e.Department].filter(Boolean).join(' · ') || 'Sin puesto asignado',
      value: e.EmployeeID
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
]

// --- Alta -------------------------------------------------------------------
const modalAgregar = ref(false)
const guardando = ref(false)
const formAlta = ref({ email: null, jobTitle: '', department: '', managerId: SIN_JEFE, entryDate: '' })
const erroresAlta = ref({ email: '', entryDate: '' })

const abrirAlta = (jefeSugerido = SIN_JEFE) => {
  formAlta.value = { email: null, jobTitle: '', department: '', managerId: jefeSugerido ?? SIN_JEFE, entryDate: '' }
  erroresAlta.value = { email: '' }
  modalAgregar.value = true
  cargarUsuariosDisponibles()
}

const guardarAlta = async () => {
  erroresAlta.value.email = formAlta.value.email ? '' : 'Selecciona un usuario del portal'
  // La antiguedad determina los dias de vacaciones, por eso es obligatoria.
  erroresAlta.value.entryDate = formAlta.value.entryDate ? '' : 'Indica la fecha de ingreso'
  if (erroresAlta.value.email) return

  guardando.value = true
  try {
    await axios.post('/rh/organigrama/empleados', {
      email: formAlta.value.email,
      jobTitle: formAlta.value.jobTitle.trim(),
      department: formAlta.value.department.trim(),
      managerId: formAlta.value.managerId === SIN_JEFE ? null : formAlta.value.managerId,
      entryDate: formAlta.value.entryDate
    })
    modalAgregar.value = false
    toast.add({ title: 'Empleado agregado al organigrama', color: 'success', icon: 'i-mdi-check-circle' })
    await cargar()
  } catch (error) {
    console.error('Error al agregar empleado:', error)
    toast.add({
      title: 'No se pudo agregar al empleado',
      description: mensajeError(error, 'Intenta de nuevo.'),
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    guardando.value = false
  }
}

// --- Edición ----------------------------------------------------------------
const modalEditar = ref(false)
const empleadoEditado = ref(null)
const formEdicion = ref({ jobTitle: '', department: '', managerId: SIN_JEFE, entryDate: '' })

const abrirEdicion = (empleado) => {
  empleadoEditado.value = empleado
  formEdicion.value = {
    jobTitle: empleado.JobTitle || '',
    department: empleado.Department || '',
    managerId: empleado.ManagerID == null ? SIN_JEFE : empleado.ManagerID,
    entryDate: empleado.EntryDate ? String(empleado.EntryDate).slice(0, 10) : ''
  }
  modalEditar.value = true
}

const guardarEdicion = async () => {
  if (!empleadoEditado.value) return
  guardando.value = true
  try {
    await axios.put(`/rh/organigrama/empleados/${empleadoEditado.value.EmployeeID}`, {
      jobTitle: formEdicion.value.jobTitle.trim(),
      department: formEdicion.value.department.trim(),
      managerId: formEdicion.value.managerId === SIN_JEFE ? null : formEdicion.value.managerId,
      entryDate: formEdicion.value.entryDate || undefined
    })
    modalEditar.value = false
    toast.add({ title: 'Organigrama actualizado', color: 'success', icon: 'i-mdi-check-circle' })
    await cargar()
  } catch (error) {
    console.error('Error al actualizar empleado:', error)
    toast.add({
      title: 'No se pudo actualizar al empleado',
      description: mensajeError(error, 'Intenta de nuevo.'),
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    guardando.value = false
  }
}

// --- Baja -------------------------------------------------------------------
const modalEliminar = ref(false)
const empleadoEliminado = ref(null)

const abrirEliminacion = (empleado) => {
  empleadoEliminado.value = empleado
  modalEliminar.value = true
}

// Nombre del jefe que heredaría a los subordinados, para explicarlo en el aviso.
const jefeDelEliminado = computed(() => {
  const id = empleadoEliminado.value?.ManagerID
  if (id == null) return null
  return empleados.value.find(e => e.EmployeeID === id) || null
})

const subordinadosDirectos = computed(() => {
  const id = empleadoEliminado.value?.EmployeeID
  if (id == null) return 0
  return empleados.value.filter(e => e.ManagerID === id).length
})

const confirmarEliminacion = async () => {
  if (!empleadoEliminado.value) return
  guardando.value = true
  try {
    await axios.delete(`/rh/organigrama/empleados/${empleadoEliminado.value.EmployeeID}`)
    modalEliminar.value = false
    toast.add({ title: 'Empleado retirado del organigrama', color: 'success', icon: 'i-mdi-check-circle' })
    await cargar()
  } catch (error) {
    console.error('Error al eliminar empleado:', error)
    toast.add({
      title: 'No se pudo retirar al empleado',
      description: mensajeError(error, 'Intenta de nuevo.'),
      color: 'error',
      icon: 'i-mdi-alert-circle'
    })
  } finally {
    guardando.value = false
  }
}

const iniciales = (nombre) => {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase()
}

onMounted(() => cargar())
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo el lienzo del diagrama. -->
  <UDashboardPanel id="rh-organigrama" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Organigrama" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <!-- El interruptor sólo existe si el backend autorizó la edición. -->
          <USwitch
            v-if="puedeEditar"
            v-model="modoEdicion"
            label="Editar organigrama"
            :ui="{ label: 'text-sm' }"
          />

          <UButton
            v-if="puedeEditar && modoEdicion"
            color="primary"
            icon="i-mdi-account-plus"
            label="Agregar"
            @click="abrirAlta()"
          />

          <UButton
            color="neutral"
            variant="outline"
            icon="i-mdi-refresh"
            :loading="cargando"
            label="Actualizar"
            @click="cargar"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Aviso de impacto: quien edita debe saber que está tocando el flujo de
           autorización de vacaciones, no sólo un diagrama informativo. -->
      <UAlert
        icon="i-mdi-information-outline"
        color="primary"
        variant="subtle"
        class="mb-4 shrink-0"
        title="Esta jerarquía define quién autoriza las vacaciones"
        description="Las solicitudes se envían primero al jefe directo que aparece aquí y después a dirección general. Cambiar el jefe de una persona cambia de inmediato su ruta de autorización."
      />

      <UAlert
        v-if="errorCarga"
        icon="i-mdi-alert-circle-outline"
        color="error"
        variant="subtle"
        class="mb-4 shrink-0"
        title="No se pudo cargar el organigrama"
        :description="errorCarga"
      />

      <!-- Métricas: ayudan a detectar un organigrama incompleto de un vistazo. -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 shrink-0">
        <template v-if="cargaInicial">
          <UCard v-for="i in 3" :key="`met-skel-${i}`">
            <USkeleton class="h-8 w-16 mb-2" />
            <USkeleton class="h-3 w-32" />
          </UCard>
        </template>

        <template v-else>
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-3xl font-bold text-primary">
                  {{ metricas.total }}
                </h2>
                <span class="text-sm font-medium text-muted">Personas en el organigrama</span>
              </div>
              <UIcon name="i-mdi-account-group-outline" class="size-12 text-primary opacity-50" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <h2
                  class="text-3xl font-bold"
                  :class="metricas.sinPuesto ? 'text-warning' : 'text-ink-700 dark:text-ink-300'"
                >
                  {{ metricas.sinPuesto }}
                </h2>
                <span class="text-sm font-medium text-muted">Sin puesto asignado</span>
              </div>
              <UIcon
                name="i-mdi-badge-account-outline"
                class="size-12 opacity-50"
                :class="metricas.sinPuesto ? 'text-warning' : 'text-ink-400'"
              />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <h2
                  class="text-3xl font-bold"
                  :class="metricas.sinJefe > 1 ? 'text-warning' : 'text-ink-700 dark:text-ink-300'"
                >
                  {{ metricas.sinJefe }}
                </h2>
                <span class="text-sm font-medium text-muted">Sin jefe asignado</span>
                <p v-if="metricas.sinJefe > 1" class="text-xs text-warning mt-0.5">
                  Hay más de una raíz; revisa si es intencional.
                </p>
              </div>
              <UIcon
                name="i-mdi-account-question-outline"
                class="size-12 opacity-50"
                :class="metricas.sinJefe > 1 ? 'text-warning' : 'text-ink-400'"
              />
            </div>
          </UCard>
        </template>
      </div>

      <!-- La tarjeta ocupa el espacio restante y es la única que scrollea por dentro. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <!-- Barra de herramientas del diagrama -->
        <div class="p-3 bg-elevated/30 border-b border-default shrink-0 flex flex-wrap items-center gap-2">
          <UInput
            v-model="busqueda"
            icon="i-mdi-magnify"
            placeholder="Buscar persona, puesto o área..."
            class="w-full sm:w-72"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="busqueda" #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-circle-x"
                aria-label="Limpiar búsqueda"
                @click="busqueda = ''"
              />
            </template>
          </UInput>

          <div class="flex-1" />

          <UButtonGroup>
            <UTooltip text="Expandir todas las ramas">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-mdi-arrow-expand-vertical"
                @click="expandirTodo"
              />
            </UTooltip>
            <UTooltip text="Colapsar todas las ramas">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-mdi-arrow-collapse-vertical"
                @click="colapsarTodo"
              />
            </UTooltip>
          </UButtonGroup>

          <UButtonGroup>
            <UTooltip text="Alejar">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-mdi-minus"
                @click="alejar"
              />
            </UTooltip>
            <UButton
              color="neutral"
              variant="outline"
              class="tabular-nums w-16 justify-center"
              :label="`${Math.round(zoom * 100)}%`"
              @click="zoomOriginal"
            />
            <UTooltip text="Acercar">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-mdi-plus"
                @click="acercar"
              />
            </UTooltip>
            <UTooltip text="Ajustar al ancho de la pantalla">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-mdi-fit-to-screen-outline"
                @click="ajustarAlAncho"
              />
            </UTooltip>
          </UButtonGroup>
        </div>

        <!-- Lienzo del diagrama: único elemento con scroll en ambos ejes. -->
        <div ref="contenedor" class="flex-1 min-h-0 overflow-auto p-6">
          <!-- Carga inicial: tarjetas fantasma con la forma del árbol. -->
          <div v-if="cargaInicial" class="flex flex-col items-center gap-16">
            <USkeleton class="h-[108px] w-[236px] rounded-xl" />
            <div class="flex gap-7">
              <USkeleton v-for="i in 3" :key="`n1-${i}`" class="h-[108px] w-[236px] rounded-xl" />
            </div>
            <div class="flex gap-7">
              <USkeleton v-for="i in 4" :key="`n2-${i}`" class="h-[108px] w-[236px] rounded-xl" />
            </div>
          </div>

          <!-- Vacío: nadie dado de alta todavía. -->
          <div v-else-if="!empleados.length" class="py-16 px-6 text-center">
            <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
              <UIcon name="i-mdi-sitemap-outline" class="size-7 text-primary" />
            </div>
            <p class="font-semibold text-highlighted mb-1">
              Aún no hay nadie en el organigrama
            </p>
            <p class="text-sm text-muted max-w-sm mx-auto mb-5">
              {{ puedeEditar
                ? 'Agrega a la primera persona; normalmente conviene empezar por dirección general y colgar de ahí al resto.'
                : 'Recursos Humanos todavía no ha capturado la estructura de la empresa.' }}
            </p>
            <UButton
              v-if="puedeEditar"
              label="Agregar a la primera persona"
              icon="i-mdi-account-plus"
              color="primary"
              @click="abrirAlta()"
            />
            <UButton
              v-else
              label="Recargar"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="subtle"
              @click="cargar"
            />
          </div>

          <!-- Diagrama. El contenedor exterior toma el tamaño ya escalado para que
               el scroll horizontal refleje el zoom aplicado al lienzo interior. -->
          <div
            v-else
            :style="{
              width: `${disposicion.ancho * zoom}px`,
              height: `${disposicion.alto * zoom}px`
            }"
            class="mx-auto"
          >
            <div
              class="relative origin-top-left"
              :style="{
                width: `${disposicion.ancho}px`,
                height: `${disposicion.alto}px`,
                transform: `scale(${zoom})`
              }"
            >
              <!-- Conectores en codo dibujados debajo de las tarjetas. -->
              <svg
                class="absolute inset-0 pointer-events-none text-ink-300 dark:text-ink-600"
                :width="disposicion.ancho"
                :height="disposicion.alto"
                :viewBox="`0 0 ${disposicion.ancho} ${disposicion.alto}`"
                aria-hidden="true"
              >
                <path
                  v-for="arista in disposicion.aristas"
                  :key="arista.id"
                  :d="arista.d"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>

              <!-- Tarjetas posicionadas en absoluto según el cálculo de layout. -->
              <div
                v-for="nodo in disposicion.nodos"
                :key="nodo.id"
                class="absolute"
                :style="{
                  left: `${nodo.x}px`,
                  top: `${nodo.y}px`,
                  width: `${ANCHO_NODO}px`,
                  height: `${ALTO_NODO}px`
                }"
              >
                <div
                  class="group relative h-full rounded-xl border bg-default px-3 py-2.5 flex items-center gap-3 transition-all"
                  :class="[
                    esUsuarioActual(nodo.datos)
                      ? 'border-primary ring-2 ring-primary/40 shadow-md'
                      : 'border-default hover:border-primary/50 hover:shadow-sm',
                    hayBusqueda && !coincide(nodo.datos) ? 'opacity-30' : '',
                    hayBusqueda && coincide(nodo.datos) ? 'ring-2 ring-warning' : ''
                  ]"
                >
                  <UAvatar
                    :src="nodo.datos.Avatar || undefined"
                    :alt="nodo.datos.FullName"
                    :text="iniciales(nodo.datos.FullName)"
                    size="lg"
                    class="shrink-0 rounded-lg"
                  />

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1 min-w-0">
                      <span
                        class="font-semibold text-sm text-highlighted truncate"
                        :title="nodo.datos.FullName"
                      >
                        {{ nodo.datos.FullName }}
                      </span>
                      <UIcon
                        v-if="esUsuarioActual(nodo.datos)"
                        name="i-mdi-account-check"
                        class="size-4 shrink-0 text-primary"
                      />
                    </div>

                    <div
                      class="text-xs truncate"
                      :class="nodo.datos.JobTitle ? 'text-muted' : 'text-warning italic'"
                      :title="nodo.datos.JobTitle || 'Sin puesto asignado'"
                    >
                      {{ nodo.datos.JobTitle || 'Sin puesto asignado' }}
                    </div>

                    <div v-if="nodo.datos.Department" class="mt-1">
                      <UBadge
                        color="neutral"
                        variant="subtle"
                        size="sm"
                        class="max-w-full"
                      >
                        <span class="truncate">{{ nodo.datos.Department }}</span>
                      </UBadge>
                    </div>

                    <!-- Acciones de edición: sólo con permiso y modo activo.
                         Van DENTRO de la tarjeta y en flujo normal, no en
                         posición absoluta: alrededor de la tarjeta entran y
                         salen los conectores, así que cualquier elemento
                         flotante termina encimándose con ellos. Tampoco en
                         hover, que no se descubre ni existe en táctil. -->
                    <div
                      v-if="puedeEditar && modoEdicion"
                      class="mt-2 pt-2 border-t border-default flex items-center gap-1"
                    >
                      <UTooltip text="Agregar subordinado">
                        <UButton
                          size="xs"
                          color="primary"
                          variant="ghost"
                          icon="i-mdi-account-plus-outline"
                          square
                          @click="abrirAlta(nodo.id)"
                        />
                      </UTooltip>
                      <UTooltip text="Editar puesto, área y jefe">
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          icon="i-mdi-pencil-outline"
                          square
                          @click="abrirEdicion(nodo.datos)"
                        />
                      </UTooltip>
                      <UTooltip text="Quitar del organigrama">
                        <UButton
                          size="xs"
                          color="error"
                          variant="ghost"
                          icon="i-mdi-account-remove-outline"
                          square
                          @click="abrirEliminacion(nodo.datos)"
                        />
                      </UTooltip>
                    </div>
                  </div>

                  <!-- Plegado: botón anclado al borde inferior, sobre el conector. -->
                  <UTooltip
                    v-if="nodo.tieneHijos"
                    :text="nodo.plegado
                      ? `Desplegar ${totalDescendientes(nodo.id)} persona(s) a cargo`
                      : 'Colapsar esta rama'"
                  >
                    <button
                      type="button"
                      class="absolute z-10 flex items-center gap-1 rounded-full border border-default bg-default px-2 h-6 text-xs font-medium text-muted hover:text-primary hover:border-primary transition-colors"
                      style="top: auto; bottom: -12px; left: 50%; transform: translateX(-50%);"
                      @click.stop="alternarRama(nodo.id)"
                    >
                      <UIcon
                        :name="nodo.plegado ? 'i-mdi-chevron-down' : 'i-mdi-chevron-up'"
                        class="size-4"
                      />
                      <span class="tabular-nums">{{ totalDescendientes(nodo.id) }}</span>
                    </button>
                  </UTooltip>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Alta de empleado -->
      <UModal v-model:open="modalAgregar" title="Agregar al organigrama">
        <template #body>
          <div class="space-y-4">
            <UFormField
              label="Usuario del portal"
              required
              :error="erroresAlta.email"
              help="Sólo aparecen los usuarios que todavía no forman parte del organigrama."
            >
              <USelectMenu
                v-model="formAlta.email"
                :items="opcionesUsuario"
                :loading="cargandoUsuarios"
                value-key="value"
                placeholder="Selecciona un usuario"
                :search-input="{ placeholder: 'Buscar por nombre o correo...' }"
                icon="i-mdi-account-search-outline"
                class="w-full"
              >
                <template #item-label="{ item }">
                  <div class="min-w-0">
                    <div class="truncate">
                      {{ item.label }}
                    </div>
                    <div class="text-xs text-muted truncate">
                      {{ item.descripcion }}
                    </div>
                  </div>
                </template>

                <template #empty>
                  <p class="text-sm text-muted p-2">
                    No hay usuarios pendientes de agregar.
                  </p>
                </template>
              </USelectMenu>
            </UFormField>

            <UFormField label="Puesto">
              <UInput
                v-model="formAlta.jobTitle"
                placeholder="Ejemplo: Gerente de Ventas"
                icon="i-mdi-badge-account-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Área">
              <UInput
                v-model="formAlta.department"
                placeholder="Ejemplo: Comercial"
                icon="i-mdi-office-building-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Fecha de ingreso"
              required
              :error="erroresAlta.entryDate"
              help="De ella depende la antigüedad y, con ella, los días de vacaciones que le corresponden."
            >
              <UInput
                v-model="formAlta.entryDate"
                type="date"
                :max="new Date().toISOString().slice(0, 10)"
                icon="i-mdi-calendar-account-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Jefe directo"
              help="Es quien recibirá primero sus solicitudes de vacaciones."
            >
              <USelectMenu
                v-model="formAlta.managerId"
                :items="opcionesJefe()"
                value-key="value"
                :search-input="{ placeholder: 'Buscar jefe...' }"
                icon="i-mdi-account-tie-outline"
                class="w-full"
              >
                <template #item-label="{ item }">
                  <div class="min-w-0">
                    <div class="truncate">
                      {{ item.label }}
                    </div>
                    <div class="text-xs text-muted truncate">
                      {{ item.descripcion }}
                    </div>
                  </div>
                </template>
              </USelectMenu>
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="modalAgregar = false">
              Cancelar
            </UButton>
            <UButton color="primary" :loading="guardando" @click="guardarAlta">
              Agregar
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Edición de un nodo -->
      <UModal v-model:open="modalEditar" title="Editar posición en el organigrama">
        <template #body>
          <div class="space-y-4">
            <div v-if="empleadoEditado" class="flex items-center gap-3 rounded-lg bg-elevated/40 p-3">
              <UAvatar
                :src="empleadoEditado.Avatar || undefined"
                :alt="empleadoEditado.FullName"
                :text="iniciales(empleadoEditado.FullName)"
                size="md"
                class="rounded-lg"
              />
              <div class="min-w-0">
                <div class="font-semibold text-highlighted truncate">
                  {{ empleadoEditado.FullName }}
                </div>
                <div class="text-xs text-muted truncate">
                  {{ empleadoEditado.Email }}
                </div>
              </div>
            </div>

            <UFormField label="Puesto">
              <UInput
                v-model="formEdicion.jobTitle"
                placeholder="Ejemplo: Gerente de Ventas"
                icon="i-mdi-badge-account-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Área">
              <UInput
                v-model="formEdicion.department"
                placeholder="Ejemplo: Comercial"
                icon="i-mdi-office-building-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Fecha de ingreso"
              help="Cambiarla recalcula la antigüedad y los días de vacaciones que le corresponden."
            >
              <UInput
                v-model="formEdicion.entryDate"
                type="date"
                :max="new Date().toISOString().slice(0, 10)"
                icon="i-mdi-calendar-account-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Jefe directo"
              help="Al cambiarlo, sus vacaciones pasarán a autorizarse por la nueva persona."
            >
              <USelectMenu
                v-model="formEdicion.managerId"
                :items="opcionesJefe(empleadoEditado?.EmployeeID)"
                value-key="value"
                :search-input="{ placeholder: 'Buscar jefe...' }"
                icon="i-mdi-account-tie-outline"
                class="w-full"
              >
                <template #item-label="{ item }">
                  <div class="min-w-0">
                    <div class="truncate">
                      {{ item.label }}
                    </div>
                    <div class="text-xs text-muted truncate">
                      {{ item.descripcion }}
                    </div>
                  </div>
                </template>
              </USelectMenu>
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="modalEditar = false">
              Cancelar
            </UButton>
            <UButton color="primary" :loading="guardando" @click="guardarEdicion">
              Guardar cambios
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Baja del organigrama -->
      <UModal v-model:open="modalEliminar" title="Quitar del organigrama">
        <template #body>
          <div class="space-y-3">
            <p class="text-muted">
              ¿Seguro que quieres quitar a
              <b class="text-highlighted">{{ empleadoEliminado?.FullName }}</b>
              del organigrama?
            </p>

            <UAlert
              v-if="subordinadosDirectos"
              icon="i-mdi-alert-outline"
              color="warning"
              variant="subtle"
              title="Sus subordinados cambian de jefe"
              :description="jefeDelEliminado
                ? `Las ${subordinadosDirectos} persona(s) a su cargo pasarán a depender de ${jefeDelEliminado.FullName}, que autorizará sus vacaciones a partir de ahora.`
                : `Las ${subordinadosDirectos} persona(s) a su cargo quedarán sin jefe directo, como raíces del organigrama.`"
            />

            <p class="text-sm text-muted">
              El usuario conserva su acceso al portal; sólo deja de formar parte de la
              estructura jerárquica.
            </p>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="modalEliminar = false">
              Cancelar
            </UButton>
            <UButton color="error" :loading="guardando" @click="confirmarEliminacion">
              Quitar del organigrama
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
