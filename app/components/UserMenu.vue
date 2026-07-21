<script setup>
// Menú de usuario: perfil, notificaciones, tema y cierre de sesión.
// La preferencia de tema se persiste en el backend, igual que en el portal actual.
import { useAuthStore } from '~/stores/auth'
import { useNotificationsStore } from '~/stores/notifications'

defineProps({
  collapsed: Boolean
})

const authStore = useAuthStore()
const notifStore = useNotificationsStore()
const colorMode = useColorMode()

const nombre = computed(() => authStore.user?.name || authStore.user?.email || 'Usuario')

const iniciales = computed(() => {
  const n = authStore.user?.name || 'U'
  return n.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
})

const avatar = computed(() => ({
  src: authStore.user?.avatar || undefined,
  alt: nombre.value,
  text: iniciales.value
}))

const aplicarTema = (modo) => {
  colorMode.preference = modo
  authStore.saveProfile({ themePref: modo }).catch(() => {})
}

const cerrarSesion = async () => {
  authStore.logout()
  await navigateTo('/login')
}

const items = computed(() => [
  [{
    type: 'label',
    label: nombre.value,
    avatar: avatar.value
  }],
  [{
    label: 'Mi perfil',
    icon: 'solar:user-circle-bold-duotone',
    to: '/app/perfil'
  }, {
    label: 'Notificaciones',
    icon: 'solar:bell-bold-duotone',
    onSelect: () => notifStore.openDrawer()
  }],
  [{
    label: 'Apariencia',
    icon: 'solar:sun-moon-bold-duotone',
    children: [{
      label: 'Claro',
      icon: 'solar:sun-bold-duotone',
      type: 'checkbox',
      checked: colorMode.value === 'light',
      onSelect: (e) => {
        e.preventDefault()
        aplicarTema('light')
      }
    }, {
      label: 'Oscuro',
      icon: 'solar:moon-bold-duotone',
      type: 'checkbox',
      checked: colorMode.value === 'dark',
      onSelect: (e) => {
        e.preventDefault()
        aplicarTema('dark')
      }
    }]
  }],
  [{
    label: 'Cerrar sesión',
    icon: 'solar:logout-2-bold-duotone',
    onSelect: cerrarSesion
  }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :avatar="avatar"
      :label="collapsed ? undefined : nombre"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />
  </UDropdownMenu>
</template>
