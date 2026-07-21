<script setup>
// Cambio de empresa SAP (SBOINOVA / SBOMIKNE / SBOLOG).
// Muestra el logo de la empresa activa sobre el fondo normal del sidebar, sin
// recuadro de color. Sólo permite cambiar si el usuario tiene `canSwitchCompany`.
import { useAuthStore } from '~/stores/auth'
import { useCompanyStore } from '~/stores/company'

defineProps({
  collapsed: Boolean
})

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const colorMode = useColorMode()

// Cada empresa tiene dos variantes de logo. Como aquí el fondo es el del
// sidebar (claro u oscuro según el tema), hay que elegir la que contrasta:
//   tema claro  -> printLogo (versión oscura)
//   tema oscuro -> logo (versión blanca)
const logoDe = (empresa) => {
  if (!empresa) return null
  return colorMode.value === 'dark'
    ? (empresa.logoDark || empresa.logo)
    : (empresa.printLogo || empresa.logo)
}

const logoActual = computed(() => logoDe(companyStore.company))

const items = computed(() => [
  companyStore.companies.map(co => ({
    label: co.label,
    avatar: { src: logoDe(co), alt: co.label },
    active: companyStore.currentCompany === co.id,
    onSelect: () => companyStore.setCompany(co.id)
  }))
])
</script>

<template>
  <UDropdownMenu
    v-if="authStore.canSwitchCompany"
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
    >
      <img
        :src="logoActual"
        :alt="companyStore.company?.label"
        class="h-6 w-auto max-w-32 object-contain shrink-0"
      >
    </UButton>
  </UDropdownMenu>

  <!-- Sin permiso de cambio: sólo se muestra el logo de la empresa activa -->
  <UButton
    v-else
    color="neutral"
    variant="ghost"
    block
    :square="collapsed"
    class="pointer-events-none"
  >
    <img
      :src="logoActual"
      :alt="companyStore.company?.label"
      class="h-6 w-auto max-w-32 object-contain shrink-0"
    >
  </UButton>
</template>
