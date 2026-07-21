<script setup>
// Administración de roles y accesos al menú.
// Lógica portada tal cual de admin/Users.vue: el árbol de menús se arma en
// memoria a partir de la lista plana y los permisos se guardan por rol.
import axios from '~/utils/axios'

const toast = useToast()

// --- ESTADO ---
const roles = ref([])
const allMenus = ref([])
const existingPermissions = ref([]) // Todos los permisos traídos de la BD
const selectedRole = ref(null)
const selectedMenuIds = ref([])
const saving = ref(false)

// --- COMPUTED: Transformar lista plana a Árbol ---
const menuTree = computed(() => {
  if (!allMenus.value.length) return []

  const buildBranch = (parentId) => {
    return allMenus.value
      .filter(menu => menu.ParentID === parentId)
      .sort((a, b) => (a.DisplayOrder || 0) - (b.DisplayOrder || 0))
      .map(menu => ({
        ...menu,
        children: buildBranch(menu.MenuID)
      }))
  }

  return buildBranch(null)
})

// --- API & LOGICA ---

const loadData = async () => {
  try {
    const res = await axios.get('/admin/config-data')

    roles.value = res.data.roles
    allMenus.value = res.data.menus
    existingPermissions.value = res.data.permissions || []
  } catch (e) {
    console.error('Error cargando datos', e)
  }
}

const selectRole = (role) => {
  selectedRole.value = role

  // FILTRAR: Buscamos en la lista de todos los permisos, los que coinciden con este RoleID
  const rolePerms = existingPermissions.value.filter(p => p.RoleID === role.RoleID)

  // Mapeamos solo los MenuID al array de selección
  selectedMenuIds.value = rolePerms.map(p => p.MenuID)
}

const savePermissions = async () => {
  if (!selectedRole.value) return
  saving.value = true
  try {
    await axios.post('/admin/update-permissions', {
      roleId: selectedRole.value.RoleID,
      menuIds: selectedMenuIds.value
    })

    existingPermissions.value = existingPermissions.value.filter(p => p.RoleID !== selectedRole.value.RoleID)
    const newPerms = selectedMenuIds.value.map(menuId => ({
      RoleID: selectedRole.value.RoleID,
      MenuID: menuId
    }))
    existingPermissions.value.push(...newPerms)

    toast.add({ title: 'Permisos actualizados correctamente', color: 'success' })
  } catch (e) {
    toast.add({ title: 'Error guardando', color: 'error' })
  } finally {
    saving.value = false
  }
}

// Vuetify permitía v-model sobre un array con :value; UCheckbox trabaja con
// booleanos, así que el alta/baja del MenuID en selectedMenuIds se hace a mano.
const isChecked = menuId => selectedMenuIds.value.includes(menuId)

const toggleMenu = (menuId, value) => {
  if (value) {
    if (!selectedMenuIds.value.includes(menuId)) selectedMenuIds.value.push(menuId)
  } else {
    selectedMenuIds.value = selectedMenuIds.value.filter(id => id !== menuId)
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <UDashboardPanel id="admin-roles-accesos">
    <template #header>
      <UDashboardNavbar title="Roles y Accesos">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            v-if="selectedRole"
            icon="i-mdi-content-save"
            :loading="saving"
            @click="savePermissions"
          >
            Guardar Cambios
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid grid-cols-12 gap-4">
        <!-- Panel Izquierdo: Roles -->
        <div class="col-span-12 md:col-span-3">
          <UCard :ui="{ body: 'p-2' }">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-mdi-shield-lock"
                  class="size-5 text-primary"
                />
                <h2 class="text-lg font-semibold text-highlighted">
                  Roles y Accesos
                </h2>
              </div>
              <p class="text-xs text-muted mt-1">
                Selecciona un rol para gestionar sus permisos.
              </p>
            </template>

            <p class="text-xs font-medium text-dimmed uppercase px-2 py-2">
              Roles disponibles
            </p>

            <div class="flex flex-col gap-1">
              <button
                v-for="role in roles"
                :key="role.RoleID"
                type="button"
                class="flex items-center gap-3 w-full text-left rounded-lg px-2 py-2 transition-colors hover:bg-elevated"
                :class="selectedRole?.RoleID === role.RoleID ? 'bg-elevated ring ring-primary/40' : ''"
                @click="selectRole(role)"
              >
                <UAvatar
                  icon="i-mdi-account-cog"
                  size="sm"
                  :ui="{ root: 'bg-primary/10 text-primary' }"
                />

                <span class="flex-1 font-medium text-highlighted truncate">
                  {{ role.RoleName }}
                </span>

                <UIcon
                  name="i-mdi-chevron-right"
                  class="size-4 text-dimmed"
                />
              </button>
            </div>
          </UCard>
        </div>

        <!-- Panel Derecho: Permisos -->
        <div class="col-span-12 md:col-span-9">
          <div
            v-if="selectedRole"
            class="mb-4"
          >
            <h3 class="text-lg font-semibold text-highlighted">
              Editando: <span class="text-primary">{{ selectedRole.RoleName }}</span>
            </h3>
            <span class="text-xs text-muted">
              {{ selectedMenuIds.length }} permisos activos
            </span>
          </div>

          <UAlert
            v-if="!selectedRole"
            color="info"
            variant="subtle"
            icon="i-mdi-information"
            title="Selecciona un rol del menú izquierdo para ver y modificar los módulos a los que tiene acceso."
          />

          <div
            v-else
            class="grid grid-cols-12 gap-4"
          >
            <div
              v-for="module in menuTree"
              :key="module.MenuID"
              class="col-span-12 lg:col-span-6 xl:col-span-4"
            >
              <UCard
                class="h-full"
                :ui="{ body: 'p-0', header: 'px-3 py-2' }"
              >
                <template #header>
                  <div class="flex items-center gap-2">
                    <UCheckbox
                      :model-value="isChecked(module.MenuID)"
                      @update:model-value="v => toggleMenu(module.MenuID, v)"
                    />
                    <UIcon
                      :name="module.Icon ? `i-${module.Icon}` : 'i-mdi-circle-small'"
                      class="size-5 text-primary shrink-0"
                    />
                    <span class="font-semibold text-highlighted truncate">
                      {{ module.Title }}
                    </span>
                  </div>
                </template>

                <div
                  v-if="!module.children.length"
                  class="p-4 text-center text-muted text-sm"
                >
                  Módulo de acceso directo
                </div>

                <div
                  v-else
                  class="divide-y divide-default"
                >
                  <template
                    v-for="child in module.children"
                    :key="child.MenuID"
                  >
                    <!-- Hijo con nietos: colapsable -->
                    <UCollapsible
                      v-if="child.children && child.children.length"
                      class="px-3 py-2"
                    >
                      <div class="flex items-center gap-2 w-full">
                        <UCheckbox
                          :model-value="isChecked(child.MenuID)"
                          @update:model-value="v => toggleMenu(child.MenuID, v)"
                          @click.stop
                        />
                        <span class="flex-1 font-medium text-highlighted truncate text-sm">
                          {{ child.Title }}
                        </span>
                        <UIcon
                          :name="child.Icon ? `i-${child.Icon}` : 'i-mdi-folder'"
                          class="size-4 text-muted"
                        />
                        <UIcon
                          name="i-mdi-chevron-down"
                          class="size-4 text-dimmed"
                        />
                      </div>

                      <template #content>
                        <div class="pl-6 pt-1 flex flex-col gap-1">
                          <div
                            v-for="grandchild in child.children"
                            :key="grandchild.MenuID"
                            class="flex items-center gap-2"
                          >
                            <UCheckbox
                              :model-value="isChecked(grandchild.MenuID)"
                              @update:model-value="v => toggleMenu(grandchild.MenuID, v)"
                            />
                            <span class="flex-1 text-sm text-default truncate">
                              {{ grandchild.Title }}
                            </span>
                            <UIcon
                              :name="grandchild.Icon ? `i-${grandchild.Icon}` : 'i-mdi-circle-small'"
                              class="size-4 text-dimmed"
                            />
                          </div>
                        </div>
                      </template>
                    </UCollapsible>

                    <!-- Hijo simple -->
                    <div
                      v-else
                      class="flex items-center gap-2 px-3 py-2"
                    >
                      <UCheckbox
                        :model-value="isChecked(child.MenuID)"
                        @update:model-value="v => toggleMenu(child.MenuID, v)"
                      />
                      <span class="flex-1 text-sm text-default truncate">
                        {{ child.Title }}
                      </span>
                      <UIcon
                        :name="child.Icon ? `i-${child.Icon}` : 'i-mdi-circle-small'"
                        class="size-4 text-dimmed"
                      />
                    </div>
                  </template>
                </div>
              </UCard>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
