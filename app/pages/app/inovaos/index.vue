<script setup>
// /app/inovaos no tiene vista propia: redirige al Inicio del módulo.
// (En el portal Vuetify esto lo resolvía la redirección de la ruta padre
// definida en InovaLayout.vue.)
definePageMeta({
  middleware: [
    () => navigateTo('/app/inovaos/home', { replace: true })
  ]
})
</script>

<template>
  <div />
</template>
