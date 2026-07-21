<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'save'])

const dialog = ref(props.modelValue)

const industries = [
  'Tecnología',
  'Manufactura',
  'Servicios',
  'Construcción',
  'Logística',
  'Retail',
  'Salud'
]

const prospect = ref({
  name: '',
  rfc: '',
  industry: '',
  contact: '',
  email: '',
  phone: ''
})

// Las reglas de v-form pasan a la función `validate` de UForm.
const validate = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: 'Requerido' })
  if (state.email && !/.+@.+\..+/.test(state.email)) {
    errors.push({ name: 'email', message: 'Email no válido' })
  }
  return errors
}

watch(() => props.modelValue, (val) => {
  dialog.value = val
})

watch(dialog, (val) => {
  emit('update:modelValue', val)
})

const close = () => {
  dialog.value = false
}

const resetForm = () => {
  prospect.value = {
    name: '',
    rfc: '',
    industry: '',
    contact: '',
    email: '',
    phone: ''
  }
}

// UForm sólo dispara @submit cuando la validación pasa.
const save = () => {
  emit('save', { ...prospect.value, id: Date.now(), status: 'Nuevo', lastFollowup: new Date().toISOString() })
  resetForm()
  close()
}
</script>

<template>
  <UModal
    v-model:open="dialog"
    title="Nuevo Prospecto (Logo)"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UForm
        id="add-prospect-form"
        :state="prospect"
        :validate="validate"
        class="grid grid-cols-12 gap-3"
        @submit="save"
      >
        <UFormField
          label="Nombre de la Empresa / Cliente"
          name="name"
          required
          class="col-span-12"
        >
          <UInput v-model="prospect.name" class="w-full" />
        </UFormField>
        <UFormField label="RFC / Tax ID" name="rfc" class="col-span-12 sm:col-span-6">
          <UInput v-model="prospect.rfc" class="w-full" />
        </UFormField>
        <UFormField label="Industria / Sector" name="industry" class="col-span-12 sm:col-span-6">
          <USelect v-model="prospect.industry" :items="industries" class="w-full" />
        </UFormField>
        <UFormField label="Contacto Principal" name="contact" class="col-span-12">
          <UInput v-model="prospect.contact" icon="i-mdi-account" class="w-full" />
        </UFormField>
        <UFormField label="Email" name="email" class="col-span-12 sm:col-span-6">
          <UInput v-model="prospect.email" icon="i-mdi-email" class="w-full" />
        </UFormField>
        <UFormField label="Teléfono" name="phone" class="col-span-12 sm:col-span-6">
          <UInput v-model="prospect.phone" icon="i-mdi-phone" class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" @click="close">
          Cancelar
        </UButton>
        <UButton type="submit" form="add-prospect-form" color="primary">
          Guardar Prospecto
        </UButton>
      </div>
    </template>
  </UModal>
</template>
