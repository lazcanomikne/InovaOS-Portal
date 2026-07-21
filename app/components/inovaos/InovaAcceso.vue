<script setup>
// Guardia de acceso al módulo InovaOS.
//
// Antes vivía en InovaLayout.vue (el layout anidado con <router-view>). Como en
// Nuxt cada página es independiente, esta lógica se envuelve en un componente
// con slot que las 5 páginas del módulo reutilizan.
//
// Emite `listo` cuando el usuario sí está dado de alta en InovaOS, para que la
// página dispare sus cargas (fetchResumen, fetchPendientes, etc.) igual que
// antes hacía el onMounted del hijo del <router-view>.
import { useInovaosStore } from '~/stores/inovaos'
import { useAuthStore } from '~/stores/auth'

const emit = defineEmits(['listo'])

const store = useInovaosStore()
const authStore = useAuthStore()
const authEmail = computed(() => authStore.user?.email || '')
const loadingInit = ref(true)

onMounted(async () => {
  if (!store.usuarios.length) await store.fetchUsuarios()
  loadingInit.value = false
  if (store.habilitado) emit('listo')
})
</script>

<template>
  <div v-if="loadingInit" class="py-16 text-center">
    <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
  </div>

  <div v-else-if="!store.habilitado" class="mx-auto max-w-xl py-8">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-mdi-alert-outline"
      title="No tienes acceso a InovaTask"
      :description="`Tu correo (${authEmail}) no está registrado en InovaOS, así que no puedes ver ni operar pendientes. Pide que te den de alta en InovaOS con este mismo correo.`"
    />
  </div>

  <slot v-else />
</template>
