<script setup>
// Panel lateral de notificaciones. Se alimenta del store real del portal
// (GET /notifications) y marca todo como leído al abrirse.
import { formatTimeAgo } from '@vueuse/core'
import { useNotificationsStore } from '~/stores/notifications'

const notifStore = useNotificationsStore()

const abierto = computed({
  get: () => notifStore.drawer,
  set: (val) => {
    notifStore.drawer = val
    if (!val) notifStore.markClosed()
  }
})

// El backend devuelve las columnas en PascalCase (SQL Server).
const titulo = n => n.Title || n.title || 'Notificación'
const cuerpo = n => n.Body || n.body || ''
const fecha = n => n.CreatedAt || n.createdAt
const leida = n => !!(n.IsRead ?? n.isRead)
const enlace = n => n.Url || n.url || undefined
</script>

<template>
  <USlideover
    v-model:open="abierto"
    title="Notificaciones"
  >
    <template #body>
      <div
        v-if="!notifStore.items.length"
        class="text-sm text-muted text-center py-8"
      >
        No tienes notificaciones.
      </div>

      <component
        :is="enlace(n) ? 'NuxtLink' : 'div'"
        v-for="n in notifStore.items"
        :key="n.NotificationID || n.id"
        :to="enlace(n)"
        class="px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-start gap-3 relative -mx-3 first:-mt-3 last:-mb-3"
      >
        <UChip
          color="error"
          :show="!leida(n)"
          inset
        >
          <UAvatar
            icon="solar:bell-bold-duotone"
            size="md"
          />
        </UChip>

        <div class="text-sm flex-1 min-w-0">
          <p class="flex items-center justify-between gap-2">
            <span class="text-highlighted font-medium truncate">{{ titulo(n) }}</span>
            <time
              v-if="fecha(n)"
              :datetime="fecha(n)"
              class="text-muted text-xs shrink-0"
              v-text="formatTimeAgo(new Date(fecha(n)))"
            />
          </p>
          <p class="text-dimmed">
            {{ cuerpo(n) }}
          </p>
        </div>
      </component>
    </template>
  </USlideover>
</template>
