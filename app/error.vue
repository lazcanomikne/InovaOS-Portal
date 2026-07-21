<script setup>
// Página de error del portal (adaptada de views/NotFound.vue del portal Vuetify).
// Cubre el 404 y cualquier otro error no capturado.
const props = defineProps({
  error: {
    type: Object,
    default: () => ({})
  }
})

const esNoEncontrada = computed(() => Number(props.error?.statusCode) === 404)

const titulo = computed(() => esNoEncontrada.value ? 'Página no encontrada' : 'Ocurrió un error')

const detalle = computed(() => {
  if (esNoEncontrada.value) {
    return 'Lo sentimos, la ruta que intentas acceder no existe o ha sido movida.'
  }
  return props.error?.message || 'Algo salió mal. Intenta de nuevo o vuelve al inicio.'
})

useSeoMeta({
  title: 'Portal Inovatech',
  description: 'La página que buscas no existe o ha sido movida.'
})

useHead({
  htmlAttrs: { lang: 'es' }
})

const volver = () => clearError({ redirect: '/app/dashboard' })
</script>

<template>
  <UApp>
    <div class="min-h-screen flex items-center justify-center p-6">
      <UCard class="w-full max-w-lg">
        <div class="flex flex-col items-center text-center py-8 px-4">
          <UIcon
            name="i-mdi-alert-octagon-outline"
            class="size-28 text-error mb-4"
          />

          <h1 class="text-5xl font-black text-highlighted">
            {{ error?.statusCode || 'Error' }}
          </h1>

          <h2 class="text-xl font-bold text-highlighted mt-2">
            {{ titulo }}
          </h2>

          <p class="text-muted mt-4">
            {{ detalle }}
          </p>

          <UButton
            size="lg"
            icon="i-mdi-home"
            class="mt-6 px-8"
            @click="volver"
          >
            Volver al Dashboard
          </UButton>
        </div>
      </UCard>
    </div>
  </UApp>
</template>
