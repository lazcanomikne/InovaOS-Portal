<script setup>
// Gestión de usuarios: rol, flags y vendedores visibles por empresa.
// La lógica de permisos (roles, restricción de vendedores por empresa) se porta
// tal cual de admin/UsuariosAdmin.vue.
import axios from '~/utils/axios'

const toast = useToast()

const loading = ref(false)
const users = ref([])
const roles = ref([])
const search = ref('')
const showDialog = ref(false)
const savingDialog = ref(false)
const selectedUser = ref(null)

// Datos editables del diálogo
const edit = ref({ FullName: '', Email: '', RoleID: null, IsActive: true, CanSwitchCompany: false, CanEditOrgChart: false,
  JobTitle: '', Department: '', EntryDate: '', ManagerID: null })

// Opciones de jefe: la misma plantilla, para que el organigrama que se arma
// aquí sea el mismo que en vacaciones.
const jefes = ref([])
const opcionesJefe = computed(() =>
  jefes.value
    .filter(j => j.EmployeeID !== selectedUser.value?.EmployeeID)
    .map(j => ({ label: j.NombreCompleto, descripcion: j.JobTitle, value: j.EmployeeID }))
)
const erroresEdit = ref({ FullName: '', Email: '' })
// Vendedores asignados (por empresa) y disponibles (por empresa) para el usuario en edición
const assignedByCompany = ref({}) // { SBOINOVA: ['Juan', ...], SBOMIKNE: [...], SBOLOG: [...] }
const availableByCompany = ref({}) // { SBOINOVA: ['Juan','Maria',...], ... }
const loadingDialog = ref(false)

const COMPANIES = [
  { id: 'SBOINOVA', label: 'Inovatech' },
  { id: 'SBOMIKNE', label: 'Mikne (SBOMIKNE + SBOEKSAS)' },
  { id: 'SBOLOG', label: 'Log Company' }
]

// v-data-table usaba headers; UTable usa columnas de TanStack Table.
// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el texto largo se recorta con elipsis en lugar de
// ensanchar la tabla. Mismo criterio que el pipeline.
const headers = [
  { key: 'FullName', title: 'Usuario', w: 'w-[19%]' },
  { key: 'Email', title: 'Email', w: 'w-[22%]' },
  { key: 'RoleName', title: 'Rol', w: 'w-[11%]' },
  { key: 'IsActive', title: 'Activo', align: 'center', w: 'w-[7%]' },
  { key: 'CanSwitchCompany', title: 'Cambia empresa', align: 'center', w: 'w-[9%]' },
  { key: 'SlpCounts', title: 'Vendedores asignados', sortable: false, w: 'w-[26%]' },
  { key: 'acciones', title: '', align: 'end', sortable: false, w: 'w-[6%]' }
]

const columns = headers.map((hdr) => {
  const align = hdr.align === 'end' ? 'text-right' : hdr.align === 'center' ? 'text-center' : ''
  return {
    id: hdr.key,
    // La columna de acciones se pinta por slot; no tiene campo propio.
    ...(hdr.key === 'acciones' ? {} : { accessorKey: hdr.key }),
    header: hdr.title,
    enableSorting: hdr.sortable !== false,
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

// El único filtro de esta vista es la búsqueda por texto.
const hayFiltros = computed(() => !!search.value)

const limpiarFiltros = () => { search.value = '' }

// Opciones de rol para USelect (value/label a partir de RoleID/RoleName)
const roleOptions = computed(() =>
  roles.value.map(r => ({ label: r.RoleName, value: r.RoleID }))
)

const filteredUsers = computed(() => {
  if (!search.value) return users.value
  const s = search.value.toLowerCase()
  return users.value.filter(u =>
    (u.FullName || '').toLowerCase().includes(s)
    || (u.Email || '').toLowerCase().includes(s)
    || (u.RoleName || '').toLowerCase().includes(s)
  )
})

const fetchUsers = async () => {
  loading.value = true
  try {
    const [u, r, cat] = await Promise.all([
      axios.get('/admin/users-admin'),
      axios.get('/admin/users-admin/roles'),
      // El catálogo de jefes sale de gestión de vacaciones: misma fuente que el
      // organigrama, para que los datos cuadren.
      axios.get('/rh/gestion-vacaciones/catalogos').catch(() => ({ data: {} }))
    ])
    users.value = u.data
    roles.value = r.data
    jefes.value = cat.data?.jefes || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const openEdit = async (user) => {
  selectedUser.value = user
  edit.value = {
    FullName: user.FullName || '',
    Email: user.Email || '',
    RoleID: user.RoleID,
    IsActive: !!user.IsActive,
    CanSwitchCompany: !!user.CanSwitchCompany,
    CanEditOrgChart: !!user.CanEditOrgChart,
    // Datos de RH: sólo aplican si la persona tiene ficha de empleado.
    JobTitle: user.JobTitle || '',
    Department: user.Department || '',
    EntryDate: user.EntryDate ? String(user.EntryDate).slice(0, 10) : '',
    ManagerID: user.ManagerID ?? null
  }
  erroresEdit.value = { FullName: '', Email: '' }
  assignedByCompany.value = {}
  availableByCompany.value = {}
  showDialog.value = true
  loadingDialog.value = true
  try {
    const ass = await axios.get(`/admin/users-admin/${user.UserID}/salespeople`)
    assignedByCompany.value = ass.data
    // Cargar disponibles para cada empresa en paralelo
    const reqs = await Promise.all(COMPANIES.map(c =>
      axios.get(`/admin/users-admin/company-salespeople/${c.id}`)
        .then(r => [c.id, r.data])
        .catch(() => [c.id, []])
    ))
    availableByCompany.value = Object.fromEntries(reqs)
  } catch (e) {
    console.error(e)
  } finally {
    loadingDialog.value = false
  }
}

const save = async () => {
  if (!selectedUser.value) return

  // El nombre viaja también a la ficha de empleado y el correo es la identidad
  // con la que se inicia sesión, así que se validan antes de enviar.
  erroresEdit.value.FullName = edit.value.FullName.trim() ? '' : 'El nombre es obligatorio'
  erroresEdit.value.Email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(edit.value.Email.trim())
    ? ''
    : 'Correo con formato inválido'
  if (erroresEdit.value.FullName || erroresEdit.value.Email) return

  savingDialog.value = true
  try {
    // 1. Actualizar usuario (datos, rol y permisos)
    await axios.put(`/admin/users-admin/${selectedUser.value.UserID}`, edit.value)
    // 2. Actualizar vendedores por cada empresa
    for (const c of COMPANIES) {
      await axios.put(`/admin/users-admin/${selectedUser.value.UserID}/salespeople`, {
        Company: c.id,
        SlpNames: assignedByCompany.value[c.id] || []
      })
    }
    showDialog.value = false
    await fetchUsers()
  } catch (e) {
    console.error(e)
    toast.add({ title: e.response?.data?.msg || 'Error guardando', color: 'error' })
  } finally {
    savingDialog.value = false
  }
}

// --- Crear usuario ---
const showCreate = ref(false)
const creating = ref(false)
const newUser = ref({ Email: '', FullName: '', RoleID: null, IsActive: true, CanSwitchCompany: false, CanEditOrgChart: false })
const openCreate = () => {
  newUser.value = { Email: '', FullName: '', RoleID: (roles.value[0]?.RoleID ?? null), IsActive: true, CanSwitchCompany: false, CanEditOrgChart: false }
  showCreate.value = true
}
const createUser = async () => {
  const email = (newUser.value.Email || '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    toast.add({ title: 'Ingresa un email válido', color: 'error' })
    return
  }
  creating.value = true
  try {
    await axios.post('/admin/users-admin', newUser.value)
    showCreate.value = false
    await fetchUsers()
  } catch (e) {
    toast.add({ title: e.response?.data?.msg || 'Error creando usuario', color: 'error' })
  } finally {
    creating.value = false
  }
}

// --- Eliminar usuario ---
const showDelete = ref(false)
const deleting = ref(false)
const userToDelete = ref(null)
const askDelete = (user) => {
  userToDelete.value = user
  showDelete.value = true
}
const confirmDelete = async () => {
  deleting.value = true
  try {
    await axios.delete(`/admin/users-admin/${userToDelete.value.UserID}`)
    showDelete.value = false
    await fetchUsers()
  } catch (e) {
    toast.add({ title: e.response?.data?.msg || 'Error eliminando usuario', color: 'error' })
  } finally {
    deleting.value = false
  }
}

onMounted(fetchUsers)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="admin-usuarios" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Gestión de Usuarios">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="success"
            icon="i-mdi-account-plus"
            @click="openCreate"
          >
            Nuevo usuario
          </UButton>

          <UButton
            icon="i-mdi-refresh"
            :loading="loading"
            @click="fetchUsers"
          >
            Actualizar
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-muted mb-4 shrink-0">
        Rol y restricciones de vendedores visibles por empresa
      </p>

      <UAlert
        color="info"
        variant="subtle"
        icon="i-mdi-information"
        class="mb-4 shrink-0"
      >
        <template #description>
          Si un usuario NO tiene vendedores asignados en una empresa, no verá datos en
          esa empresa (Pipeline, Oportunidades, Backlog, Gestión Comercial, Dashboard).
          Los usuarios con rol <strong>ADMIN</strong> ignoran esta restricción y ven todo.
        </template>
      </UAlert>

      <!-- La tarjeta ocupa el espacio restante y es la única que scrollea por dentro. -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ body: 'p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <div class="p-4 shrink-0">
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Buscar (nombre, email, rol)"
            class="w-full"
          />
        </div>

        <UTable
          :data="filteredUsers"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="w-full flex-1 min-h-0 overflow-y-auto"
          :ui="{
            base: 'table-fixed w-full',
            td: 'text-sm py-2',
            th: 'text-xs py-2'
          }"
          @select="(_e, row) => openEdit(row.original)"
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
                <USkeleton class="h-4 w-32 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-20 shrink-0" />
                <USkeleton class="h-4 w-10 shrink-0" />
                <USkeleton class="h-4 w-10 shrink-0" />
                <USkeleton class="h-4 w-40 shrink-0" />
              </div>
            </div>
          </template>

          <!-- Vacío: distingue "no hay nada" de "la búsqueda no deja ver nada",
               y ofrece la acción correspondiente en cada caso. -->
          <template #empty>
            <div class="py-12 px-6 text-center">
              <div class="mx-auto flex items-center justify-center size-14 rounded-full bg-primary/10 mb-4">
                <UIcon
                  :name="hayFiltros ? 'i-lucide-filter-x' : 'i-lucide-users'"
                  class="size-7 text-primary"
                />
              </div>

              <p class="font-semibold text-highlighted mb-1">
                {{ hayFiltros ? 'Ningún usuario coincide con la búsqueda' : 'Aún no hay usuarios registrados' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba con otro nombre, correo o rol.'
                  : 'Da de alta un usuario con su correo para que pueda iniciar sesión.' }}
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
                @click="fetchUsers"
              />
            </div>
          </template>

          <template #FullName-cell="{ row }">
            <span class="block truncate font-medium text-highlighted" :title="row.original.FullName">
              {{ row.original.FullName }}
            </span>
          </template>

          <template #Email-cell="{ row }">
            <span class="block truncate" :title="row.original.Email">
              {{ row.original.Email }}
            </span>
          </template>

          <template #RoleName-cell="{ row }">
            <UBadge
              size="sm"
              variant="subtle"
              :color="row.original.RoleName === 'ADMIN' ? 'error' : 'primary'"
              class="font-bold"
            >
              {{ row.original.RoleName }}
            </UBadge>
          </template>

          <template #IsActive-cell="{ row }">
            <UIcon
              :name="row.original.IsActive ? 'i-mdi-check-circle' : 'i-mdi-close-circle'"
              class="size-5"
              :class="row.original.IsActive ? 'text-success' : 'text-dimmed'"
            />
          </template>

          <template #CanSwitchCompany-cell="{ row }">
            <UIcon
              :name="row.original.CanSwitchCompany ? 'i-mdi-domain' : 'i-mdi-minus'"
              class="size-5"
              :class="row.original.CanSwitchCompany ? 'text-primary' : 'text-dimmed'"
            />
          </template>

          <template #SlpCounts-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="c in COMPANIES"
                :key="c.id"
                size="sm"
                variant="subtle"
                :color="(row.original.SlpCounts && row.original.SlpCounts[c.id]) ? 'primary' : 'neutral'"
              >
                {{ c.label.split(' ')[0] }}: {{ (row.original.SlpCounts && row.original.SlpCounts[c.id]) || 0 }}
              </UBadge>
            </div>
          </template>

          <template #acciones-cell="{ row }">
            <div class="flex justify-end">
              <UTooltip text="Eliminar usuario">
                <UButton
                  icon="i-mdi-delete-outline"
                  size="sm"
                  variant="ghost"
                  color="error"
                  @click.stop="askDelete(row.original)"
                />
              </UTooltip>
            </div>
          </template>
        </UTable>
      </UCard>

      <!-- Modal de edición -->
      <UModal
        v-model:open="showDialog"
        :title="selectedUser?.FullName || 'Usuario'"
        :description="selectedUser?.Email"
        :ui="{ content: 'max-w-3xl' }"
      >
        <template #body>
          <div
            v-if="selectedUser"
            class="flex flex-col gap-4"
          >
            <!-- Datos de identidad -->
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-6">
                <UFormField
                  label="Nombre completo"
                  required
                  :error="erroresEdit.FullName"
                  help="También actualiza su ficha en el organigrama."
                >
                  <UInput
                    v-model="edit.FullName"
                    icon="i-mdi-account-outline"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="col-span-12 md:col-span-6">
                <UFormField
                  label="Correo electrónico"
                  required
                  :error="erroresEdit.Email"
                  help="Es con el que inicia sesión. Al cambiarlo se mueve también su ficha de empleado."
                >
                  <UInput
                    v-model="edit.Email"
                    type="email"
                    icon="i-mdi-email-outline"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>

            <USeparator />

            <!-- Rol y permisos -->
            <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 md:col-span-3">
                <UFormField label="Rol">
                  <USelect
                    v-model="edit.RoleID"
                    :items="roleOptions"
                    icon="i-mdi-shield-account"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="col-span-12 md:col-span-3 flex items-end">
                <USwitch
                  v-model="edit.IsActive"
                  color="success"
                  label="Usuario activo"
                />
              </div>

              <div class="col-span-12 md:col-span-3 flex items-end">
                <USwitch
                  v-model="edit.CanSwitchCompany"
                  label="Puede cambiar de empresa"
                />
              </div>

              <div class="col-span-12 md:col-span-3 flex items-end">
                <UTooltip text="Permite modificar la jerarquía que autoriza las vacaciones">
                  <USwitch
                    v-model="edit.CanEditOrgChart"
                    label="Puede editar el organigrama"
                  />
                </UTooltip>
              </div>
            </div>

            <USeparator />

            <!-- Datos de empleado (RH). Son los mismos que se ven en Gestión de
                 Vacaciones: editarlos aquí los actualiza allá y viceversa. Sólo
                 tienen efecto si la persona tiene ficha de empleado. -->
            <div>
              <div class="flex items-center gap-2 mb-3">
                <UIcon name="i-mdi-badge-account-horizontal-outline" class="size-5 text-primary" />
                <span class="font-semibold text-highlighted">Datos de empleado</span>
                <span v-if="!selectedUser?.EmployeeID" class="text-xs text-muted">
                  · esta cuenta no tiene ficha de empleado
                </span>
              </div>
              <div class="grid grid-cols-12 gap-4">
                <div class="col-span-12 md:col-span-6">
                  <UFormField label="Puesto">
                    <UInput v-model="edit.JobTitle" :disabled="!selectedUser?.EmployeeID" class="w-full" />
                  </UFormField>
                </div>
                <div class="col-span-12 md:col-span-6">
                  <UFormField label="Área">
                    <UInput v-model="edit.Department" :disabled="!selectedUser?.EmployeeID" class="w-full" />
                  </UFormField>
                </div>
                <div class="col-span-12 md:col-span-6">
                  <UFormField label="Fecha de ingreso" help="Al cambiarla se recalculan los periodos de vacaciones.">
                    <UInput v-model="edit.EntryDate" type="date" :disabled="!selectedUser?.EmployeeID" class="w-full" />
                  </UFormField>
                </div>
                <div class="col-span-12 md:col-span-6">
                  <UFormField label="Jefe directo">
                    <USelectMenu
                      v-model="edit.ManagerID"
                      :items="opcionesJefe"
                      value-key="value"
                      placeholder="Sin asignar"
                      :search-input="{ placeholder: 'Buscar persona...' }"
                      icon="i-mdi-account-tie-outline"
                      :disabled="!selectedUser?.EmployeeID"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </div>

            <USeparator />

            <div>
              <div class="flex items-center gap-2 mb-2">
                <UIcon
                  name="i-mdi-account-tie"
                  class="size-5 text-primary"
                />
                <span class="font-semibold text-highlighted">Vendedores visibles por empresa</span>
              </div>
              <p class="text-xs text-muted mb-3">
                Sin vendedores asignados = el usuario no verá nada en esa empresa
                (excepto si su rol es ADMIN).
              </p>

              <UProgress
                v-if="loadingDialog"
                animation="carousel"
              />

              <div
                v-else
                class="grid grid-cols-12 gap-4"
              >
                <div
                  v-for="c in COMPANIES"
                  :key="c.id"
                  class="col-span-12 md:col-span-6"
                >
                  <UCard :ui="{ body: 'p-3' }">
                    <div class="text-xs font-bold uppercase mb-2 text-primary">
                      {{ c.label }}
                    </div>

                    <USelectMenu
                      :model-value="assignedByCompany[c.id] || []"
                      :items="availableByCompany[c.id] || []"
                      multiple
                      placeholder="Asignar vendedores"
                      class="w-full"
                      @update:model-value="v => assignedByCompany[c.id] = v"
                    />

                    <div class="text-xs text-muted mt-1">
                      {{ (assignedByCompany[c.id] || []).length }} de {{ (availableByCompany[c.id] || []).length }}
                    </div>
                  </UCard>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showDialog = false"
            >
              Cancelar
            </UButton>
            <UButton
              :loading="savingDialog"
              @click="save"
            >
              Guardar cambios
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Modal: nuevo usuario -->
      <UModal
        v-model:open="showCreate"
        title="Nuevo usuario"
        :dismissible="false"
      >
        <template #body>
          <div class="flex flex-col gap-3">
            <UAlert
              color="info"
              variant="subtle"
              description="El acceso es sin contraseña: el usuario inicia sesión con su email y un código. Basta con registrar su correo."
            />

            <UFormField label="Email *">
              <UInput
                v-model="newUser.Email"
                type="email"
                icon="i-mdi-email-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Nombre completo">
              <UInput
                v-model="newUser.FullName"
                icon="i-mdi-account"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Rol">
              <USelect
                v-model="newUser.RoleID"
                :items="roleOptions"
                icon="i-mdi-shield-account"
                class="w-full"
              />
            </UFormField>

            <div class="flex gap-6">
              <USwitch
                v-model="newUser.IsActive"
                color="success"
                label="Activo"
              />
              <USwitch
                v-model="newUser.CanSwitchCompany"
                label="Puede cambiar de empresa"
              />
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showCreate = false"
            >
              Cancelar
            </UButton>
            <UButton
              color="success"
              :loading="creating"
              @click="createUser"
            >
              Crear usuario
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Modal: confirmar eliminación -->
      <UModal
        v-model:open="showDelete"
        title="¿Eliminar usuario?"
      >
        <template #body>
          <div class="flex flex-col items-center text-center">
            <UAvatar
              icon="i-mdi-account-remove"
              size="xl"
              :ui="{ root: 'bg-error/10 text-error mb-3' }"
            />
            <h3 class="text-lg font-semibold text-highlighted mb-1">
              ¿Eliminar usuario?
            </h3>
            <p class="text-muted">
              Se eliminará a <strong>{{ userToDelete?.FullName }}</strong> ({{ userToDelete?.Email }}).
              Si está vinculado a un empleado de RH, se desvinculará sin borrar su registro.
            </p>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showDelete = false"
            >
              Cancelar
            </UButton>
            <UButton
              color="error"
              :loading="deleting"
              @click="confirmDelete"
            >
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
