<script setup>
// Catálogo de categorías y subcategorías de egresos de tesorería.
// La lógica (alta/baja/edición y el flag es_manual) se porta tal cual de
// gestion/tesoreria/CatCategorias.vue.
import { useAuthStore } from '~/stores/auth'
import axios from '~/utils/axios'

const authStore = useAuthStore()
const toast = useToast()

const categorias = ref([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const search = ref('')
const open = ref([]) // ids de categorías expandidas (equivale al v-model de v-expansion-panels)
const notify = (text, color = 'success') => {
  toast.add({ title: text, color })
}

const totalSubs = computed(() => categorias.value.reduce((a, c) => a + (c.subcategorias?.length || 0), 0))
const categoriasFiltradas = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return categorias.value
  return categorias.value.filter(c =>
    c.nombre.toLowerCase().includes(q)
    || (c.subcategorias || []).some(s => s.nombre.toLowerCase().includes(q)))
})

const isOpen = id => open.value.includes(id)
const toggleOpen = (id, value) => {
  if (value) {
    if (!open.value.includes(id)) open.value.push(id)
  } else {
    open.value = open.value.filter(x => x !== id)
  }
}

const load = async () => {
  loading.value = true
  try {
    categorias.value = (await axios.get('/tesoreria/categorias')).data
  } catch (e) {
    notify('Error cargando categorías', 'error')
  } finally {
    loading.value = false
  }
}

// ---- Categoría ----
const catForm = ref(null)
const catDlg = ref(false)
const cat = ref({ id: null, nombre: '' })
const openCat = (c = null) => {
  cat.value = c ? { id: c.id, nombre: c.nombre } : { id: null, nombre: '' }
  catDlg.value = true
}
const validateCat = (state) => {
  const errors = []
  if (!state.nombre?.trim()) errors.push({ name: 'nombre', message: 'Requerido' })
  return errors
}
const saveCat = async () => {
  try {
    await catForm.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (cat.value.id) await axios.put(`/tesoreria/categorias/${cat.value.id}`, { nombre: cat.value.nombre.trim() })
    else await axios.post('/tesoreria/categorias', { nombre: cat.value.nombre.trim(), usuario: authStore.user?.name || 'Admin' })
    notify(cat.value.id ? 'Categoría actualizada' : 'Categoría creada')
    catDlg.value = false
    await load()
  } catch (e) {
    notify(e.response?.data?.message || 'Error al guardar', 'error')
  } finally {
    saving.value = false
  }
}

const delCat = ref({ show: false, item: null })
const askDelCat = (c) => {
  delCat.value = { show: true, item: c }
}
const confirmDelCat = async () => {
  deleting.value = true
  try {
    await axios.delete(`/tesoreria/categorias/${delCat.value.item.id}`)
    notify('Categoría eliminada')
    delCat.value.show = false
    await load()
  } catch (e) {
    notify(e.response?.data?.message || 'Error al eliminar', 'error')
  } finally {
    deleting.value = false
  }
}

// ---- Subcategoría ----
const subForm = ref(null)
const subDlg = ref(false)
const sub = ref({ id: null, categoria_id: null, catNombre: '', nombre: '', es_manual: false })
const openSub = (c, s = null) => {
  sub.value = { id: s?.id || null, categoria_id: c.id, catNombre: c.nombre, nombre: s?.nombre || '', es_manual: !!s?.es_manual }
  subDlg.value = true
}
const validateSub = (state) => {
  const errors = []
  if (!state.nombre?.trim()) errors.push({ name: 'nombre', message: 'Requerido' })
  return errors
}
const saveSub = async () => {
  try {
    await subForm.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (sub.value.id)
      await axios.put(`/tesoreria/subcategorias/${sub.value.id}`, { nombre: sub.value.nombre.trim(), es_manual: sub.value.es_manual })
    else
      await axios.post('/tesoreria/subcategorias', { categoria_id: sub.value.categoria_id, nombre: sub.value.nombre.trim(), es_manual: sub.value.es_manual, usuario: authStore.user?.name || 'Admin' })
    notify(sub.value.id ? 'Subcategoría actualizada' : 'Subcategoría creada')
    subDlg.value = false
    await load()
  } catch (e) {
    notify(e.response?.data?.message || 'Error al guardar', 'error')
  } finally {
    saving.value = false
  }
}

// El original usaba confirm() del navegador; aquí se usa un UModal de confirmación.
const delSubState = ref({ show: false, item: null })
const askDelSub = (s) => {
  delSubState.value = { show: true, item: s }
}
const delSub = async () => {
  const s = delSubState.value.item
  if (!s) return
  deleting.value = true
  try {
    await axios.delete(`/tesoreria/subcategorias/${s.id}`)
    notify('Subcategoría eliminada')
    delSubState.value.show = false
    await load()
  } catch (e) {
    notify('Error al eliminar', 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <UDashboardPanel id="gestion-tesoreria-categorias">
    <template #header>
      <UDashboardNavbar title="Catálogo de Categorías">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Buscar"
            class="max-w-56"
          />

          <UButton
            icon="i-mdi-plus"
            @click="openCat()"
          >
            Nueva categoría
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Resumen -->
      <div class="grid grid-cols-12 gap-4 mb-4">
        <div class="col-span-12 sm:col-span-6">
          <UCard>
            <div class="flex items-center gap-4">
              <UAvatar
                icon="i-mdi-folder-multiple-outline"
                size="lg"
                :ui="{ root: 'bg-primary/10 text-primary' }"
              />
              <div>
                <div class="text-2xl font-bold text-highlighted">
                  {{ categorias.length }}
                </div>
                <div class="text-xs text-muted">
                  Categorías
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="col-span-12 sm:col-span-6">
          <UCard>
            <div class="flex items-center gap-4">
              <UAvatar
                icon="i-mdi-file-tree-outline"
                size="lg"
                :ui="{ root: 'bg-info/10 text-info' }"
              />
              <div>
                <div class="text-2xl font-bold text-highlighted">
                  {{ totalSubs }}
                </div>
                <div class="text-xs text-muted">
                  Subcategorías
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-mdi-shape-outline"
              class="size-5 text-primary"
            />
            <h3 class="font-semibold text-highlighted">
              Categorías de egresos
            </h3>
          </div>
        </template>

        <UProgress
          v-if="loading"
          animation="carousel"
          class="mb-3"
        />

        <div class="flex flex-col gap-2">
          <UCollapsible
            v-for="c in categoriasFiltradas"
            :key="c.id"
            :open="isOpen(c.id)"
            class="border border-default rounded-lg"
            @update:open="v => toggleOpen(c.id, v)"
          >
            <div class="flex items-center gap-2 w-full px-3 py-2 cursor-pointer">
              <UIcon
                name="i-mdi-folder-outline"
                class="size-5 text-primary"
              />
              <span class="font-bold text-highlighted">{{ c.nombre }}</span>
              <UBadge
                size="sm"
                variant="subtle"
                color="info"
              >
                {{ (c.subcategorias || []).length }} subcat.
              </UBadge>

              <div class="flex-1" />

              <UTooltip text="Editar categoría">
                <UButton
                  icon="i-mdi-pencil"
                  size="xs"
                  variant="ghost"
                  @click.stop="openCat(c)"
                />
              </UTooltip>

              <UTooltip text="Eliminar categoría">
                <UButton
                  icon="i-mdi-delete-outline"
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click.stop="askDelCat(c)"
                />
              </UTooltip>
            </div>

            <template #content>
              <div class="px-3 pb-3">
                <div class="flex flex-col gap-1">
                  <div
                    v-for="s in c.subcategorias"
                    :key="s.id"
                    class="flex items-center gap-2 rounded px-2 py-1 hover:bg-elevated"
                  >
                    <UIcon
                      name="i-mdi-subdirectory-arrow-right"
                      class="size-4 text-muted"
                    />

                    <span class="flex-1 text-sm text-default">
                      {{ s.nombre }}
                      <UBadge
                        v-if="s.es_manual"
                        size="sm"
                        color="warning"
                        variant="subtle"
                        class="ml-2"
                      >
                        captura manual
                      </UBadge>
                    </span>

                    <UButton
                      icon="i-mdi-pencil"
                      size="xs"
                      variant="ghost"
                      @click="openSub(c, s)"
                    />
                    <UButton
                      icon="i-mdi-delete-outline"
                      size="xs"
                      variant="ghost"
                      color="error"
                      @click="askDelSub(s)"
                    />
                  </div>

                  <div
                    v-if="!(c.subcategorias || []).length"
                    class="text-muted text-xs px-2 py-2"
                  >
                    Sin subcategorías (categoría de nivel único).
                  </div>
                </div>

                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-mdi-plus"
                  class="mt-1"
                  @click="openSub(c)"
                >
                  Agregar subcategoría
                </UButton>
              </div>
            </template>
          </UCollapsible>
        </div>

        <div
          v-if="!loading && !categoriasFiltradas.length"
          class="text-center text-muted py-8"
        >
          No hay categorías. Crea la primera con «Nueva categoría».
        </div>
      </UCard>

      <!-- Modal categoría -->
      <UModal
        v-model:open="catDlg"
        :title="cat.id ? 'Editar categoría' : 'Nueva categoría'"
        :dismissible="false"
      >
        <template #body>
          <UForm
            ref="catForm"
            :state="cat"
            :validate="validateCat"
            @submit="saveCat"
          >
            <UFormField
              label="Nombre de la categoría"
              name="nombre"
              required
            >
              <UInput
                v-model="cat.nombre"
                autofocus
                icon="i-mdi-folder-outline"
                class="w-full"
              />
            </UFormField>
          </UForm>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="catDlg = false"
            >
              Cancelar
            </UButton>
            <UButton
              :color="cat.id ? 'primary' : 'success'"
              :loading="saving"
              @click="saveCat"
            >
              {{ cat.id ? 'Guardar' : 'Crear' }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Modal subcategoría -->
      <UModal
        v-model:open="subDlg"
        :title="sub.id ? 'Editar subcategoría' : 'Nueva subcategoría'"
        :dismissible="false"
      >
        <template #body>
          <UForm
            ref="subForm"
            :state="sub"
            :validate="validateSub"
            class="flex flex-col gap-3"
            @submit="saveSub"
          >
            <div class="text-xs text-muted">
              Categoría: <strong class="text-highlighted">{{ sub.catNombre }}</strong>
            </div>

            <UFormField
              label="Nombre de la subcategoría"
              name="nombre"
              required
            >
              <UInput
                v-model="sub.nombre"
                autofocus
                icon="i-mdi-subdirectory-arrow-right"
                class="w-full"
              />
            </UFormField>

            <USwitch
              v-model="sub.es_manual"
              color="warning"
              label="Captura manual (el usuario escribe el concepto libre al registrar el egreso)"
            />
          </UForm>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="subDlg = false"
            >
              Cancelar
            </UButton>
            <UButton
              :color="sub.id ? 'primary' : 'success'"
              :loading="saving"
              @click="saveSub"
            >
              {{ sub.id ? 'Guardar' : 'Crear' }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Confirmar borrado categoría -->
      <UModal
        v-model:open="delCat.show"
        title="¿Eliminar categoría?"
      >
        <template #body>
          <div class="flex flex-col items-center text-center">
            <UAvatar
              icon="i-mdi-folder-remove"
              size="xl"
              :ui="{ root: 'bg-error/10 text-error mb-3' }"
            />
            <h3 class="text-lg font-semibold text-highlighted mb-1">
              ¿Eliminar categoría?
            </h3>
            <p class="text-muted">
              Se dará de baja <strong class="text-highlighted">{{ delCat.item?.nombre }}</strong>
              y todas sus subcategorías.
            </p>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="delCat.show = false"
            >
              Cancelar
            </UButton>
            <UButton
              color="error"
              :loading="deleting"
              @click="confirmDelCat"
            >
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- Confirmar borrado subcategoría -->
      <UModal
        v-model:open="delSubState.show"
        title="¿Eliminar subcategoría?"
      >
        <template #body>
          <p class="text-muted text-center">
            ¿Eliminar la subcategoría
            <strong class="text-highlighted">{{ delSubState.item?.nombre }}</strong>?
          </p>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="delSubState.show = false"
            >
              Cancelar
            </UButton>
            <UButton
              color="error"
              :loading="deleting"
              @click="delSub"
            >
              Eliminar
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
