<script setup>
// Shell del portal: sidebar alimentado por el menú de SQL, cambio de empresa,
// notificaciones y chat con sondeo, y re-suscripción a push en cada arranque.
import { useAuthStore } from '~/stores/auth'
import { useCompanyStore } from '~/stores/company'
import { useChatStore } from '~/stores/chat'
import { useNotificationsStore } from '~/stores/notifications'
import { ensureSubscribed } from '~/utils/push'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const chatStore = useChatStore()
const notifStore = useNotificationsStore()
const { items: menuItems, fetchMenu } = useMenu()

const open = ref(false)

const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

// Enlaces fijos que no vienen de SQL (chat y notas viven fuera del menú).
const enlacesFijos = computed(() => [{
  label: 'Mensajes',
  icon: 'solar:chat-round-dots-bold-duotone',
  to: '/app/chat',
  badge: chatStore.unread > 0 ? String(chatStore.unread) : undefined
}, {
  label: 'Notas',
  icon: 'solar:notes-bold-duotone',
  to: '/app/notes'
}])

// Paleta de comandos: todo lo navegable del menú dinámico.
const groups = computed(() => [{
  id: 'menu',
  label: 'Ir a',
  items: [
    ...menuItems.value.flatMap(i => (i.children?.length ? i.children : [i])),
    ...enlacesFijos.value
  ].filter(i => i.to)
}])

// --- Sondeo de notificaciones (admin) + chat (todos) ---
let notifTimer = null

const onVisible = () => {
  if (document.visibilityState !== 'visible') return
  notifStore.fetch()
  chatStore.fetchUnread()
}

const startNotifications = () => {
  ensureSubscribed() // reasegura el push si ya hay permiso concedido
  chatStore.fetchUnread()
  notifStore.fetch()
  if (notifTimer) clearInterval(notifTimer)
  notifTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    chatStore.fetchUnread()
    notifStore.fetch()
  }, 45000)
  document.addEventListener('visibilitychange', onVisible)
}

// Tinte de empresa: pinta el sidebar y las barras con el color de la empresa
// activa, para que el usuario sepa dónde está sin leer el selector.
const aplicarTinteEmpresa = () => {
  const color = companyStore.company?.color
  if (color) document.documentElement.style.setProperty('--empresa-color', color)
}

watch(() => companyStore.currentCompany, (nuevo, anterior) => {
  aplicarTinteEmpresa()
  // Al cambiar de empresa recargamos: es la forma más segura de refetchear toda
  // la data con el nuevo header X-Company sin mezclar resultados.
  if (anterior && nuevo && anterior !== nuevo) window.location.reload()
})

onMounted(async () => {
  aplicarTinteEmpresa()
  if (!authStore.user) await authStore.restoreSession()
  await fetchMenu()
  startNotifications()
})

onUnmounted(() => {
  if (notifTimer) clearInterval(notifTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="portal"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <CompanyMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <!-- Menú dinámico desde SQL -->
        <UNavigationMenu
          :collapsed="collapsed"
          :items="menuItems"
          orientation="vertical"
          tooltip
          popover
        />

        <!-- Enlaces fijos (chat / notas) al fondo -->
        <UNavigationMenu
          :collapsed="collapsed"
          :items="enlacesFijos"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
