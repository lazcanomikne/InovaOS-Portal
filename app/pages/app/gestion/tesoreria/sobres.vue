<script setup>
// Catálogo de sobres de tesorería.
// Regla de negocio portada tal cual: un sobre sólo se puede editar o eliminar
// cuando su saldo es exactamente $0.
import { useAuthStore } from '~/stores/auth'
import axios from '~/utils/axios'

const authStore = useAuthStore()
const toast = useToast()

const items = ref([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const search = ref('')
const form = ref(null)
const notify = (text, color = 'success') => {
  toast.add({ title: text, color })
}

// v-data-table usaba headers; UTable usa columnas de TanStack Table.
// `w` es el peso de la columna en porcentaje. La tabla usa `table-fixed`, así
// que estos anchos mandan y el contenido largo se recorta con elipsis en vez de
// ensanchar la tabla. Los pesos suman 100%.
const columns = [
  { key: 'nombre', title: 'Nombre', w: 'w-[25%]' },
  { key: 'descripcion', title: 'Descripción', w: 'w-[38%]' },
  { key: 'usuario_creacion', title: 'Creado por', w: 'w-[15%]' },
  { key: 'saldo', title: 'Saldo', w: 'w-[12%]', align: 'end' },
  { key: 'acciones', title: 'Acciones', w: 'w-[10%]', align: 'end', sortable: false }
].map(d => ({
  // La columna de acciones no tiene dato de origen, por eso usa `id`.
  ...(d.key === 'acciones' ? { id: d.key, enableSorting: false } : { accessorKey: d.key }),
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

const activos = computed(() => items.value.filter(s => s.activo))

// Distingue la primera carga (mostramos esqueletos) de las recargas posteriores
// (mantenemos los datos visibles para que la pantalla no parpadee).
const cargaInicial = computed(() => loading.value && !items.value.length)

// El único filtro de la pantalla es la búsqueda de texto.
const hayFiltros = computed(() => !!search.value.trim())
const limpiarFiltros = () => {
  search.value = ''
}
const saldoTotal = computed(() => activos.value.reduce((a, s) => a + Number(s.saldo || 0), 0))
const conSaldo = computed(() => activos.value.filter(s => Number(s.saldo) !== 0).length)
const canModify = item => Number(item.saldo) === 0

// El filtro de texto lo hacía :search del v-data-table; en UTable se aplica antes.
const filas = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return activos.value
  return activos.value.filter(s =>
    (s.nombre || '').toLowerCase().includes(q)
    || (s.descripcion || '').toLowerCase().includes(q)
    || (s.usuario_creacion || '').toLowerCase().includes(q)
  )
})

const loadData = async () => {
  loading.value = true
  try {
    items.value = (await axios.get('/tesoreria/sobres')).data
  } catch (e) {
    notify('Error cargando sobres', 'error')
  } finally {
    loading.value = false
  }
}

// ---- Crear / Editar ----
const dialog = ref({ show: false, id: null, saldo: 0 })
const edit = ref({ nombre: '', descripcion: '' })

const openDialog = (item = null) => {
  if (item) {
    dialog.value = { show: true, id: item.id, saldo: Number(item.saldo) }
    edit.value = { nombre: item.nombre, descripcion: item.descripcion || '' }
  } else {
    dialog.value = { show: true, id: null, saldo: 0 }
    edit.value = { nombre: '', descripcion: '' }
  }
}

// Equivalente a las :rules del v-text-field de Vuetify.
const validate = (state) => {
  const errors = []
  if (!state.nombre?.trim()) errors.push({ name: 'nombre', message: 'El nombre es requerido' })
  return errors
}

const save = async () => {
  try {
    await form.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (dialog.value.id) {
      await axios.put(`/tesoreria/sobres/${dialog.value.id}`, {
        nombre: edit.value.nombre.trim(),
        descripcion: edit.value.descripcion
      })
      notify('Sobre actualizado')
    } else {
      await axios.post('/tesoreria/sobres', {
        nombre: edit.value.nombre.trim(),
        descripcion: edit.value.descripcion,
        usuario: authStore.user?.name || 'Admin'
      })
      notify('Sobre creado')
    }
    dialog.value.show = false
    await loadData()
  } catch (e) {
    notify(e.response?.data?.message || 'Error al guardar el sobre', 'error')
  } finally {
    saving.value = false
  }
}

// ---- Eliminar ----
const del = ref({ show: false, item: null })
const askDelete = (item) => {
  del.value = { show: true, item }
}
const confirmDelete = async () => {
  deleting.value = true
  try {
    await axios.delete(`/tesoreria/sobres/${del.value.item.id}`)
    notify('Sobre eliminado')
    del.value.show = false
    await loadData()
  } catch (e) {
    notify(e.response?.data?.message || 'Error al eliminar el sobre', 'error')
  } finally {
    deleting.value = false
  }
}

// ---- Helpers ----
const money = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0)
const saldoColor = (v) => {
  const n = Number(v)
  if (n === 0) return 'neutral'
  return n < 0 ? 'error' : 'success'
}

onMounted(loadData)
</script>

<template>
  <!-- `overflow-hidden` en el body: la página no scrollea, sólo la tabla. -->
  <UDashboardPanel id="gestion-tesoreria-sobres" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Catálogo de Sobres">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UInput
            v-model="search"
            icon="i-mdi-magnify"
            placeholder="Buscar"
            class="max-w-60"
          />

          <UButton
            icon="i-mdi-plus"
            @click="openDialog()"
          >
            Nuevo sobre
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Resumen: franja fija, no se comprime -->
      <div class="grid grid-cols-12 gap-4 mb-4 shrink-0">
        <!-- Esqueletos: sólo en la primera carga, para que no parpadeen al recargar -->
        <template v-if="cargaInicial">
          <div v-for="i in 3" :key="`kpi-skel-${i}`" class="col-span-12 sm:col-span-4">
            <UCard>
              <div class="flex items-center gap-4">
                <USkeleton class="size-10 rounded-full shrink-0" />
                <div class="flex-1">
                  <USkeleton class="h-6 w-28 mb-2" />
                  <USkeleton class="h-3 w-24" />
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <template v-else>
          <div class="col-span-12 sm:col-span-4">
            <UCard>
              <div class="flex items-center gap-4">
                <UAvatar
                  icon="i-mdi-email-multiple-outline"
                  size="lg"
                  :ui="{ root: 'bg-primary/10 text-primary' }"
                />
                <div>
                  <div class="text-2xl font-bold text-highlighted">
                    {{ activos.length }}
                  </div>
                  <div class="text-xs text-muted">
                    Sobres activos
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <div class="col-span-12 sm:col-span-4">
            <UCard>
              <div class="flex items-center gap-4">
                <UAvatar
                  icon="i-mdi-cash-multiple"
                  size="lg"
                  :ui="{ root: 'bg-success/10 text-success' }"
                />
                <div>
                  <div
                    class="text-2xl font-bold"
                    :class="saldoTotal < 0 ? 'text-error' : 'text-highlighted'"
                  >
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
            <UCard>
              <div class="flex items-center gap-4">
                <UAvatar
                  icon="i-mdi-lock-outline"
                  size="lg"
                  :ui="{ root: 'bg-warning/10 text-warning' }"
                />
                <div>
                  <div class="text-2xl font-bold text-highlighted">
                    {{ conSaldo }}
                  </div>
                  <div class="text-xs text-muted">
                    Con saldo (bloqueados)
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </template>
      </div>

      <!-- Tabla: ocupa el espacio restante y es lo único que scrollea -->
      <UCard
        class="flex-1 min-h-0 flex flex-col"
        :ui="{ header: 'shrink-0', body: 'p-0 flex-1 min-h-0 flex flex-col' }"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-mdi-format-list-bulleted"
              class="size-5 text-primary"
            />
            <h3 class="font-semibold text-highlighted">
              Sobres
            </h3>
          </div>
        </template>

        <UTable
          :data="filas"
          :columns="columns"
          :loading="loading"
          sticky="header"
          class="w-full flex-1 min-h-0 overflow-y-auto"
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
                <USkeleton class="h-4 w-40 shrink-0" />
                <USkeleton class="h-4 flex-1" />
                <USkeleton class="h-4 w-24 shrink-0" />
                <USkeleton class="h-5 w-20 shrink-0" />
                <USkeleton class="h-7 w-16 shrink-0" />
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
                {{ hayFiltros ? 'Ningún sobre coincide con los filtros' : 'Aún no hay sobres' }}
              </p>
              <p class="text-sm text-muted max-w-sm mx-auto mb-5">
                {{ hayFiltros
                  ? 'Prueba con otro texto de búsqueda o límpiala para ver el catálogo completo.'
                  : 'El catálogo está vacío. Crea el primer sobre con «Nuevo sobre».' }}
              </p>

              <UButton
                v-if="hayFiltros"
                label="Limpiar filtros"
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
                @click="loadData"
              />
            </div>
          </template>

          <template #nombre-cell="{ row }">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon
                name="i-mdi-email-outline"
                class="size-5 shrink-0 text-primary"
              />
              <span
                class="block truncate font-medium text-highlighted"
                :title="row.original.nombre"
              >{{ row.original.nombre }}</span>
            </div>
          </template>

          <template #descripcion-cell="{ row }">
            <span class="block truncate text-muted" :title="row.original.descripcion">
              {{ row.original.descripcion || '—' }}
            </span>
          </template>

          <template #usuario_creacion-cell="{ row }">
            <span class="block truncate" :title="row.original.usuario_creacion">
              {{ row.original.usuario_creacion || '—' }}
            </span>
          </template>

          <template #saldo-cell="{ row }">
            <div class="text-right">
              <UBadge
                :color="saldoColor(row.original.saldo)"
                size="sm"
                class="font-bold"
              >
                {{ money(row.original.saldo) }}
              </UBadge>
            </div>
          </template>

          <template #acciones-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UTooltip :text="canModify(row.original) ? 'Editar' : 'No se puede editar: el sobre tiene saldo'">
                <UButton
                  icon="i-mdi-pencil"
                  size="sm"
                  variant="ghost"
                  :disabled="!canModify(row.original)"
                  @click="openDialog(row.original)"
                />
              </UTooltip>

              <UTooltip :text="canModify(row.original) ? 'Eliminar' : 'No se puede eliminar: el sobre tiene saldo'">
                <UButton
                  icon="i-mdi-delete-outline"
                  size="sm"
                  variant="ghost"
                  color="error"
                  :disabled="!canModify(row.original)"
                  @click="askDelete(row.original)"
                />
              </UTooltip>
            </div>
          </template>
        </UTable>
      </UCard>

      <!-- MODAL: crear / editar -->
      <UModal
        v-model:open="dialog.show"
        :title="dialog.id ? 'Editar sobre' : 'Nuevo sobre'"
        :dismissible="false"
      >
        <template #body>
          <UForm
            ref="form"
            :state="edit"
            :validate="validate"
            class="flex flex-col gap-3"
            @submit="save"
          >
            <UFormField
              label="Nombre del sobre"
              name="nombre"
              required
            >
              <UInput
                v-model="edit.nombre"
                autofocus
                icon="i-mdi-email-outline"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Descripción (opcional)"
              name="descripcion"
            >
              <UTextarea
                v-model="edit.descripcion"
                :rows="2"
                autoresize
                class="w-full"
              />
            </UFormField>

            <UAlert
              v-if="dialog.id"
              color="info"
              variant="subtle"
            >
              <template #description>
                Saldo actual: <strong>{{ money(dialog.saldo) }}</strong>. Solo se puede editar con saldo en $0.
              </template>
            </UAlert>
          </UForm>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="dialog.show = false"
            >
              Cancelar
            </UButton>
            <UButton
              :color="dialog.id ? 'primary' : 'success'"
              :loading="saving"
              @click="save"
            >
              {{ dialog.id ? 'Guardar cambios' : 'Crear sobre' }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- MODAL: confirmar eliminación -->
      <UModal
        v-model:open="del.show"
        title="¿Eliminar sobre?"
      >
        <template #body>
          <div class="flex flex-col items-center text-center">
            <UAvatar
              icon="i-mdi-delete-alert"
              size="xl"
              :ui="{ root: 'bg-error/10 text-error mb-3' }"
            />
            <h3 class="text-lg font-semibold text-highlighted mb-1">
              ¿Eliminar sobre?
            </h3>
            <p class="text-muted">
              Se dará de baja el sobre <strong class="text-highlighted">{{ del.item?.nombre }}</strong>.
              Podrás volver a crear uno con el mismo nombre.
            </p>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="del.show = false"
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
