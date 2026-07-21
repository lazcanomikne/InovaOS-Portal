<script setup>
// Drawer de detalle compartido entre los submódulos de InovaOS.
//
// Reemplaza a components/inovaos/InovaDetalle.vue (v-navigation-drawer) y además
// absorbe el diálogo de edición que antes vivía en InovaLayout.vue, para que el
// componente sea autocontenido y cada página sólo tenga que montarlo.
//
// El estado de apertura sigue viviendo en el store (drawerOpen / detalle /
// abrirDetalle / cerrarDetalle), igual que en el portal Vuetify.
import { useInovaosStore } from '~/stores/inovaos'
import {
  ST_HEX, estatusColor, etiquetaEstatus, formatFecha, fdatetime,
  accionesDisponibles, motivoSinAcciones, puedeEditar, puedeEliminar, msgError
} from '~/utils/inova-helpers'
import InovaForm from '~/components/inovaos/InovaForm.vue'

const store = useInovaosStore()
const toast = useToast()
const hoy = new Date().toISOString().slice(0, 10)

const notificar = (texto, color = 'success') => toast.add({ title: texto, color })

const abierto = computed({
  get: () => store.drawerOpen,
  set: (v) => {
    if (v) store.drawerOpen = true
    else store.cerrarDetalle()
  }
})

const d = computed(() => store.detalle?.pendiente || null)
const evidencias = computed(() => store.detalle?.evidencias || [])
const checklist = computed(() => store.detalle?.checklist || [])
const historial = computed(() => store.detalle?.historial || [])
const acciones = computed(() => (d.value ? accionesDisponibles(d.value, store.myId) : []))
const motivo = computed(() => (d.value ? motivoSinAcciones(d.value) : ''))
const editable = computed(() => d.value && puedeEditar(d.value, store.myId))
const eliminable = computed(() => d.value && puedeEliminar(d.value, store.myId))

const cargando = ref(null)
const nuevoChk = ref('')
const dlgReagendar = ref(false)
const nuevaFecha = ref('')
const dlgAprobar = ref(false)
const comentario = ref('')
const dlgDevolver = ref(false)
const motivoDev = ref('')
const dlgEliminar = ref(false)

// --- Edición (venía de InovaLayout.vue) ---
const dlgEditar = ref(false)
const guardando = ref(false)
const editItem = ref({})
let editId = null

const abrirEdicion = (pend) => {
  editItem.value = { ...pend }
  editId = pend.id
  dlgEditar.value = true
}
const guardarEdicion = async (payload) => {
  guardando.value = true
  try {
    await store.editar(editId, payload)
    dlgEditar.value = false
    notificar('Pendiente actualizado')
  } catch (err) {
    notificar(msgError(err), 'error')
  } finally {
    guardando.value = false
  }
}

const aplicar = async (estatus, extra, id) => {
  cargando.value = id || estatus
  try {
    await store.cambiarEstatus(d.value.id, estatus, extra || {})
    notificar(`Estatus: ${etiquetaEstatus(estatus)}`)
  } catch (err) {
    notificar(msgError(err), 'error')
  } finally {
    cargando.value = null
  }
}

const hacer = async (a) => {
  if (a.tipo === 'editar') {
    abrirEdicion(d.value)
    return
  }
  if (a.tipo === 'reagendar') {
    nuevaFecha.value = d.value.fecha_compromiso ? String(d.value.fecha_compromiso).slice(0, 10) : hoy
    dlgReagendar.value = true
    return
  }
  if (a.id === 'aprobar') {
    comentario.value = ''
    dlgAprobar.value = true
    return
  }
  if (a.id === 'devolver') {
    motivoDev.value = ''
    dlgDevolver.value = true
    return
  }
  if (a.id === 'concluir' && !evidencias.value.length) {
    notificar('Adjunta al menos una evidencia antes de concluir (desde la app móvil).', 'error')
    return
  }
  await aplicar(a.estatus, {}, a.id)
}

const confirmarReagendar = async () => {
  await aplicar('reagendado', { fecha_compromiso: nuevaFecha.value, detalle: `nueva fecha: ${nuevaFecha.value}` }, 'reagendar')
  dlgReagendar.value = false
}
const confirmarAprobar = async () => {
  const c = comentario.value.trim()
  await aplicar('aprobado', c ? { comentario_cierre: c } : {}, 'aprobar')
  dlgAprobar.value = false
}
const confirmarDevolver = async () => {
  const m = motivoDev.value.trim()
  if (!m) return
  await aplicar('en_progreso', { detalle: `devuelto: ${m}` }, 'devolver')
  dlgDevolver.value = false
}

const agregarChk = async () => {
  const t = nuevoChk.value.trim()
  if (!t) return
  nuevoChk.value = ''
  try {
    await store.addChecklist(d.value.id, t)
  } catch (err) {
    notificar(msgError(err), 'error')
  }
}
const archivar = async () => {
  try {
    await store.archivar(d.value.id, !d.value.archivado)
    notificar(d.value.archivado ? 'Desarchivado' : 'Archivado')
    store.cerrarDetalle()
  } catch (err) {
    notificar(msgError(err), 'error')
  }
}
const eliminar = async () => {
  dlgEliminar.value = false
  try {
    await store.eliminar(d.value.id)
    notificar('Pendiente eliminado')
  } catch (err) {
    notificar(msgError(err), 'error')
  }
}
</script>

<template>
  <div>
    <USlideover
      v-model:open="abierto"
      side="right"
      title="Detalle del pendiente"
      :ui="{ content: 'max-w-lg' }"
    >
      <template #header>
        <div
          v-if="d"
          class="flex w-full items-center justify-between rounded-lg px-3 py-2"
          :style="{ background: ST_HEX[estatusColor(d)] + '14' }"
        >
          <div class="flex items-center gap-2">
            <span
              class="inline-block size-3 shrink-0 rounded-full"
              :style="{ background: ST_HEX[estatusColor(d)] }"
            />
            <span class="text-sm font-bold" :style="{ color: ST_HEX[estatusColor(d)] }">
              {{ etiquetaEstatus(d.estatus) }}
            </span>
          </div>
          <UButton
            icon="i-mdi-close"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="store.cerrarDetalle()"
          />
        </div>
        <div v-else class="flex w-full items-center justify-end">
          <UButton
            icon="i-mdi-close"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="store.cerrarDetalle()"
          />
        </div>
      </template>

      <template #body>
        <div v-if="d">
          <h2 class="mb-1 text-lg font-bold text-highlighted">
            {{ d.titulo }}
          </h2>
          <p v-if="d.descripcion" class="mb-3 whitespace-pre-wrap text-sm text-muted">
            {{ d.descripcion }}
          </p>

          <div class="mb-3 flex flex-wrap gap-2">
            <UBadge color="neutral" variant="subtle" icon="i-mdi-flag">
              {{ d.prioridad || '—' }}
            </UBadge>
            <UBadge color="neutral" variant="subtle" icon="i-mdi-calendar-clock">
              Vence {{ formatFecha(d.fecha_compromiso) }}
            </UBadge>
            <UBadge
              v-if="d.area"
              color="neutral"
              variant="subtle"
              icon="i-mdi-shape-outline"
            >
              {{ d.area }}
            </UBadge>
          </div>

          <div class="mb-3 space-y-2">
            <div class="flex items-start gap-3">
              <UIcon name="i-mdi-account-arrow-right-outline" class="mt-0.5 size-5 shrink-0 text-dimmed" />
              <div>
                <div class="text-sm text-highlighted">
                  {{ d.responsable_nombre || 'Sin responsable' }}
                </div>
                <div class="text-xs text-muted">
                  Responsable
                </div>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-mdi-account-edit-outline" class="mt-0.5 size-5 shrink-0 text-dimmed" />
              <div>
                <div class="text-sm text-highlighted">
                  {{ d.creador_nombre || '—' }}
                </div>
                <div class="text-xs text-muted">
                  Delegado por
                </div>
              </div>
            </div>
            <div v-if="d.cliente" class="flex items-start gap-3">
              <UIcon name="i-mdi-domain" class="mt-0.5 size-5 shrink-0 text-dimmed" />
              <div>
                <div class="text-sm text-highlighted">
                  {{ d.cliente }}
                </div>
                <div class="text-xs text-muted">
                  Cliente
                </div>
              </div>
            </div>
            <div v-if="d.origen" class="flex items-start gap-3">
              <UIcon name="i-mdi-source-branch" class="mt-0.5 size-5 shrink-0 text-dimmed" />
              <div>
                <div class="text-sm text-highlighted">
                  {{ d.origen }}
                </div>
                <div class="text-xs text-muted">
                  Origen
                </div>
              </div>
            </div>
            <div v-if="d.comentario_cierre" class="flex items-start gap-3">
              <UIcon name="i-mdi-comment-check-outline" class="mt-0.5 size-5 shrink-0 text-dimmed" />
              <div>
                <div class="text-sm text-highlighted">
                  {{ d.comentario_cierre }}
                </div>
                <div class="text-xs text-muted">
                  Comentario de cierre
                </div>
              </div>
            </div>
          </div>

          <!-- Acciones -->
          <div v-if="acciones.length" class="my-3 flex flex-wrap gap-2">
            <UButton
              v-for="a in acciones"
              :key="a.id"
              :color="a.color || 'primary'"
              size="sm"
              :variant="a.fill ? 'solid' : 'soft'"
              :loading="cargando === a.id"
              @click="hacer(a)"
            >
              {{ a.texto }}
            </UButton>
          </div>
          <div v-else-if="motivo" class="my-2 text-xs text-muted">
            {{ motivo }}
          </div>

          <div class="mb-3 flex flex-wrap gap-2">
            <UButton
              v-if="editable"
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-mdi-pencil"
              @click="abrirEdicion(d)"
            >
              Editar
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              :icon="d.archivado ? 'i-mdi-archive-arrow-up-outline' : 'i-mdi-archive-outline'"
              @click="archivar"
            >
              {{ d.archivado ? 'Desarchivar' : 'Archivar' }}
            </UButton>
            <UButton
              v-if="eliminable"
              size="sm"
              color="error"
              variant="soft"
              icon="i-mdi-trash-can-outline"
              @click="dlgEliminar = true"
            >
              Eliminar
            </UButton>
          </div>

          <USeparator class="my-3" />

          <!-- Checklist -->
          <div class="mb-1 text-sm font-bold text-highlighted">
            Checklist
          </div>
          <div v-for="c in checklist" :key="c.id" class="flex items-center gap-2">
            <UCheckbox
              :model-value="!!c.completado"
              @update:model-value="v => store.toggleChecklist(c.id, v, d.id)"
            />
            <span
              class="flex-1 text-sm"
              :class="c.completado ? 'line-through text-dimmed' : 'text-default'"
            >{{ c.texto }}</span>
            <UButton
              icon="i-mdi-close"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="store.delChecklist(c.id, d.id)"
            />
          </div>
          <div class="mb-3 mt-1 flex items-center gap-2">
            <UInput
              v-model="nuevoChk"
              placeholder="Agregar paso..."
              size="sm"
              class="flex-1"
              @keyup.enter="agregarChk"
            />
            <UButton
              icon="i-mdi-plus"
              size="sm"
              color="neutral"
              variant="soft"
              :disabled="!nuevoChk.trim()"
              @click="agregarChk"
            />
          </div>

          <USeparator class="my-3" />

          <!-- Evidencias (solo lectura) -->
          <div class="mb-1 text-sm font-bold text-highlighted">
            Evidencias
            <span v-if="evidencias.length" class="text-xs font-normal text-muted">({{ evidencias.length }})</span>
          </div>
          <div v-if="!evidencias.length" class="mb-2 text-xs text-dimmed">
            Sin evidencias. Se adjuntan desde la app móvil.
          </div>
          <div v-for="ev in evidencias" :key="ev.id" class="mb-1 flex items-center gap-2">
            <UIcon name="i-mdi-paperclip" class="size-4 shrink-0 text-primary" />
            <a
              :href="ev.url"
              target="_blank"
              rel="noopener"
              class="truncate text-sm text-primary hover:underline"
            >{{ ev.nombre || ev.url }}</a>
            <span class="text-xs text-dimmed">· {{ ev.autor || '' }}</span>
          </div>

          <USeparator class="my-3" />

          <!-- Historial -->
          <div class="mb-2 text-sm font-bold text-highlighted">
            Historial
          </div>
          <ol class="space-y-3 border-l border-default pl-4">
            <li v-for="(h, i) in historial" :key="i" class="relative">
              <span class="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
              <div class="text-sm font-medium text-highlighted">
                {{ h.evento }}
              </div>
              <div class="text-xs text-muted">
                {{ h.detalle }}
              </div>
              <div class="text-xs text-dimmed">
                {{ fdatetime(h.created_at) }}
              </div>
            </li>
          </ol>
        </div>

        <div v-else-if="store.loadingDetalle" class="py-10 text-center">
          <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
        </div>
      </template>
    </USlideover>

    <!-- Reagendar -->
    <UModal v-model:open="dlgReagendar" title="Reagendar">
      <template #body>
        <UFormField label="Nueva fecha compromiso">
          <UInput
            v-model="nuevaFecha"
            type="date"
            :min="hoy"
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="dlgReagendar = false">
            Cancelar
          </UButton>
          <UButton
            color="primary"
            :loading="!!cargando"
            :disabled="!nuevaFecha"
            @click="confirmarReagendar"
          >
            Reagendar
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Aprobar -->
    <UModal v-model:open="dlgAprobar" title="Aprobar pendiente">
      <template #body>
        <UFormField label="Comentario (opcional)">
          <UTextarea
            v-model="comentario"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="dlgAprobar = false">
            Cancelar
          </UButton>
          <UButton color="success" :loading="!!cargando" @click="confirmarAprobar">
            Aprobar
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Devolver -->
    <UModal v-model:open="dlgDevolver" title="Devolver a revisión">
      <template #body>
        <UFormField label="¿Qué falta corregir? *">
          <UTextarea
            v-model="motivoDev"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="dlgDevolver = false">
            Cancelar
          </UButton>
          <UButton
            color="error"
            :loading="!!cargando"
            :disabled="!motivoDev.trim()"
            @click="confirmarDevolver"
          >
            Devolver
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Eliminar -->
    <UModal v-model:open="dlgEliminar" title="¿Eliminar este pendiente?">
      <template #body>
        <p class="text-sm text-muted">
          No se puede deshacer.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="dlgEliminar = false">
            Cancelar
          </UButton>
          <UButton color="error" @click="eliminar">
            Eliminar
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Edición (antes vivía en InovaLayout.vue) -->
    <UModal v-model:open="dlgEditar" title="Editar pendiente">
      <template #body>
        <InovaForm
          :initial="editItem"
          es-edicion
          :loading="guardando"
          @submit="guardarEdicion"
        />
      </template>
    </UModal>
  </div>
</template>
