<script setup>
const colorMode = useColorMode()

const color = computed(() => colorMode.value === 'dark' ? '#0f172a' : 'white')

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
    { rel: 'icon', type: 'image/png', href: '/favicon-claro.png', media: '(prefers-color-scheme: light)' },
    { rel: 'icon', type: 'image/png', href: '/favicon-oscuro.png', media: '(prefers-color-scheme: dark)' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
  ],
  htmlAttrs: {
    lang: 'es'
  }
})

useSeoMeta({
  title: 'InovaOS',
  description: 'InovaOS, el portal corporativo de Inovatech: CRM, Tesorería, Recursos Humanos, Logística e Ingeniería.'
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
