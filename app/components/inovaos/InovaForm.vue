<script setup>
// Formulario de captura/edición de pendientes. Lógica idéntica a la del portal
// Vuetify (components/inovaos/InovaForm.vue); sólo cambia la capa visual.
import { useInovaosStore } from '~/stores/inovaos'
import { AREAS } from '~/utils/inova-helpers'

const props = defineProps({
  initial: { type: Object, default: () => ({}) },
  esEdicion: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['submit'])
const store = useInovaosStore()
const hoy = new Date().toISOString().slice(0, 10)

const vacio = () => ({ titulo: '', descripcion: '', prioridad: 'Alta', area: null, responsable_id: null, cliente: '', fecha_compromiso: '' })
const form = reactive(vacio())

const cargar = (data) => {
  Object.assign(form, vacio(), {
    titulo: data.titulo || '',
    descripcion: data.descripcion || '',
    prioridad: data.prioridad || 'Alta',
    area: data.area || null,
    responsable_id: data.responsable_id || null,
    cliente: data.cliente || '',
    fecha_compromiso: data.fecha_compromiso ? String(data.fecha_compromiso).slice(0, 10) : ''
  })
}
watch(() => props.initial, v => cargar(v || {}), { immediate: true, deep: true })

const esParaMi = computed(() => form.responsable_id != null && Number(form.responsable_id) === Number(store.myId))
const toggleParaMi = () => {
  form.responsable_id = esParaMi.value ? null : store.myId
}

const textoBoton = computed(() => {
  if (props.esEdicion) return 'Guardar cambios'
  if (esParaMi.value) return 'Guardar para mí'
  return form.responsable_id ? 'Delegar' : 'Guardar sin asignar'
})

const submit = () => {
  if (!form.titulo.trim()) return
  emit('submit', { ...form, area: form.area || null, fecha_compromiso: form.fecha_compromiso || null })
}

// USelectMenu trabaja con { label, value }; el modelo sigue siendo el id.
const opcionesUsuarios = computed(() =>
  (store.usuarios || []).map(u => ({ label: u.nombre, value: u.id }))
)
const opcionesArea = computed(() => AREAS.map(a => ({ label: a, value: a })))
</script>

<template>
  <div>
    <UFormField label="Pendiente *" class="mb-3">
      <UInput
        v-model="form.titulo"
        placeholder="¿Qué hay que hacer?"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Descripción" class="mb-3">
      <UTextarea
        v-model="form.descripcion"
        placeholder="Detalles (opcional)"
        :rows="2"
        autoresize
        class="w-full"
      />
    </UFormField>

    <!-- Para mí (tarea personal) -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <UButton
        :variant="esParaMi ? 'solid' : 'outline'"
        :color="esParaMi ? 'primary' : 'neutral'"
        size="sm"
        :icon="esParaMi ? 'i-mdi-check-circle' : 'i-mdi-account-circle-outline'"
        @click="toggleParaMi"
      >
        {{ esParaMi ? 'Es para mí' : 'Para mí' }}
      </UButton>
      <span v-if="esParaMi" class="text-xs text-muted">Sin evidencia; la cierras en un toque.</span>
    </div>

    <UFormField label="Responsable (delegar a)" class="mb-3">
      <USelectMenu
        v-model="form.responsable_id"
        :items="opcionesUsuarios"
        value-key="value"
        placeholder="Sin asignar"
        class="w-full"
        :search-input="{ placeholder: 'Buscar persona...' }"
      />
    </UFormField>

    <div class="mb-3 flex gap-3">
      <UFormField label="Prioridad" class="flex-1">
        <USelect
          v-model="form.prioridad"
          :items="['Alta', 'Media', 'Baja']"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Área" class="flex-1">
        <USelectMenu
          v-model="form.area"
          :items="opcionesArea"
          value-key="value"
          placeholder="Sin área"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField label="Fecha compromiso" class="mb-3">
      <UInput
        v-model="form.fecha_compromiso"
        type="date"
        :min="hoy"
        class="w-full"
      />
    </UFormField>

    <div class="mt-1 flex justify-end gap-2">
      <slot name="pre-actions" />
      <UButton
        color="primary"
        :loading="loading"
        :disabled="!form.titulo.trim()"
        @click="submit"
      >
        {{ textoBoton }}
      </UButton>
    </div>
  </div>
</template>
