<script setup>
// La raíz sólo redirige: el middleware global decide a dónde según la sesión.
definePageMeta({ layout: false })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-8 animate-spin text-primary"
    />
  </div>
</template>
