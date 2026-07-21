<script setup>
// Navegación entre los submódulos de InovaOS.
//
// En el portal Vuetify esto vivía dentro de InovaLayout.vue como un layout
// anidado con <router-view>. En Nuxt el layout principal ya resuelve la
// navegación, así que el wrapper desaparece y cada página monta estas pestañas.
const route = useRoute()

const items = [
  { label: 'Inicio', icon: 'i-mdi-home-outline', value: '/app/inovaos/home' },
  { label: 'Pendientes', icon: 'i-mdi-clipboard-list-outline', value: '/app/inovaos/pendientes' },
  { label: 'Tablero', icon: 'i-mdi-chart-donut', value: '/app/inovaos/tablero' },
  { label: 'Métricas', icon: 'i-mdi-chart-bar', value: '/app/inovaos/metricas' },
  { label: 'Nuevo', icon: 'i-mdi-plus-circle-outline', value: '/app/inovaos/crear' }
]

const activo = computed(
  () => items.find(i => route.path.startsWith(i.value))?.value || items[0].value
)

const ir = (valor) => {
  if (valor && valor !== route.path) navigateTo(valor)
}
</script>

<template>
  <UTabs
    :items="items"
    :model-value="activo"
    :content="false"
    variant="link"
    color="primary"
    class="mb-6 w-full"
    @update:model-value="ir"
  />
</template>
