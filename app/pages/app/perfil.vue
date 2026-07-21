<script setup>
// Mi perfil: avatar, apariencia, empresa activa, notificaciones push y sesión.
import { useAuthStore } from '~/stores/auth'
import { useCompanyStore } from '~/stores/company'
import { enablePush, disablePush, getPermission, needsInstallForPush, pushSupported } from '~/utils/push'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const colorMode = useColorMode()
const toast = useToast()

const user = computed(() => authStore.user || {})
const avatar = ref(authStore.user?.avatar || null)
const removing = ref(false)
const fileInput = ref(null)
const notify = (text, color = 'success') => { toast.add({ title: text, color }) }

const initials = computed(() => {
  const n = user.value.name || 'U'
  return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
})

// --- Avatar ---
const pickImage = () => fileInput.value?.click()
const resizeToDataUrl = (file, size = 256) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = reject
  reader.onload = () => {
    const img = new Image()
    img.onerror = reject
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2; const sy = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = reader.result
  }
  reader.readAsDataURL(file)
})
const onFile = async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const dataUrl = await resizeToDataUrl(file, 256)
    await authStore.saveProfile({ avatar: dataUrl })
    avatar.value = dataUrl
    notify('Foto de perfil actualizada')
  } catch { notify('No se pudo procesar la imagen', 'error') }
  e.target.value = ''
}
const removeAvatar = async () => {
  removing.value = true
  try {
    await authStore.saveProfile({ avatar: '' }); avatar.value = null; notify('Foto eliminada')
  } catch { notify('Error al quitar la foto', 'error') } finally { removing.value = false }
}

// --- Tema día / noche ---
// En Nuxt UI la preferencia vive en useColorMode(); se persiste en el backend
// con la misma llamada de siempre (saveProfile { themePref }).
const temas = [
  { val: 'light', label: 'Día', icon: 'i-mdi-white-balance-sunny' },
  { val: 'dark', label: 'Noche', icon: 'i-mdi-weather-night' }
]
const theme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))
const setTheme = async (val) => {
  colorMode.preference = val
  try { await authStore.saveProfile({ themePref: val }) } catch { /* preferencia local aplicada igual */ }
}

// --- Empresa / sesión ---
const empresas = computed(() => companyStore.companies.map(c => ({ label: c.label, value: c.id })))
const switchCompany = id => companyStore.setCompany(id) // dispara recarga en el layout
const logout = async () => { authStore.logout(); await navigateTo('/login') }

// --- Notificaciones push ---
const pushPermission = ref('default')
const pushMustInstall = ref(false)
const pushBusy = ref(false)
const pushHint = computed(() => {
  if (!pushSupported()) return 'Este dispositivo no soporta notificaciones push.'
  if (pushMustInstall.value) return 'Instala la app en tu iPhone (Compartir → Agregar a inicio) para recibir avisos push.'
  if (pushPermission.value === 'denied') return 'Bloqueadas. Actívalas en los ajustes del navegador para este sitio.'
  if (pushPermission.value === 'granted') return 'Recibirás avisos y mensajes al instante.'
  return 'Actívalas para recibir avisos y mensajes al instante.'
})
const activarPush = async () => {
  pushBusy.value = true
  try {
    await enablePush()
    pushPermission.value = 'granted'
    notify('Notificaciones activadas')
  } catch (e) {
    pushPermission.value = getPermission()
    pushMustInstall.value = needsInstallForPush()
    if (e.message === 'needs-install') notify('Instala la app primero para activarlas', 'warning')
    else if (e.message === 'denied') notify('Permiso de notificaciones denegado', 'error')
    else notify('No se pudo activar', 'error')
  } finally {
    pushBusy.value = false
  }
}
const desactivarPush = async () => {
  pushBusy.value = true
  try {
    await disablePush()
    // El permiso del navegador no se puede revocar por código: sólo se elimina
    // la suscripción, así que volvemos a leer el estado real.
    pushPermission.value = getPermission()
    notify('Ya no recibirás notificaciones push en este dispositivo')
  } finally {
    pushBusy.value = false
  }
}

// getPermission()/needsInstallForPush() tocan window: se leen ya montados.
onMounted(() => {
  pushPermission.value = getPermission()
  pushMustInstall.value = needsInstallForPush()
})

// --- Actualizar la webapp (fuerza la última versión aunque el SW esté "pegado") ---
const updating = ref(false)
const updateApp = async () => {
  updating.value = true
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(async (r) => {
        try { await r.update() } catch { /* noop */ }
        if (r.waiting) r.waiting.postMessage({ type: 'SKIP_WAITING' })
      }))
    }
    if (window.caches) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch { /* ignore */ }
  // Recarga forzada para tomar la versión nueva
  window.location.reload()
}
</script>

<template>
  <UDashboardPanel id="perfil">
    <template #header>
      <UDashboardNavbar title="Mi perfil">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl">
        <!-- Datos + avatar -->
        <UCard class="mb-4">
          <div class="flex flex-col sm:flex-row items-center gap-5">
            <div class="relative">
              <UAvatar
                :src="avatar || undefined"
                :text="initials"
                size="3xl"
                class="size-28 text-2xl"
              />
              <UButton
                icon="i-mdi-camera"
                size="sm"
                square
                class="absolute -right-1 -bottom-1 ring-2 ring-default"
                aria-label="Cambiar foto"
                @click="pickImage"
              />
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                hidden
                @change="onFile"
              >
            </div>

            <div class="text-center sm:text-left">
              <div class="text-lg font-bold text-highlighted">
                {{ user.name || 'Usuario' }}
              </div>
              <div class="text-sm text-muted">
                {{ user.email }}
              </div>

              <UBadge
                color="primary"
                variant="subtle"
                icon="i-mdi-shield-account"
                class="mt-2 font-bold"
                :label="user.role || 'Personal'"
              />

              <div v-if="avatar" class="mt-2">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  :loading="removing"
                  @click="removeAvatar"
                >
                  Quitar foto
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Apariencia -->
        <UCard class="mb-4">
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Apariencia
            </h3>
          </template>

          <div class="text-sm text-muted mb-3">
            Elige cómo quieres ver la app.
          </div>

          <div class="flex gap-3">
            <button
              v-for="opt in temas"
              :key="opt.val"
              type="button"
              class="flex-1 rounded-lg border py-4 text-center transition duration-150 hover:-translate-y-0.5 cursor-pointer"
              :class="theme === opt.val
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-default text-highlighted'"
              @click="setTheme(opt.val)"
            >
              <UIcon :name="opt.icon" class="size-7 mb-1" />
              <div class="font-medium">
                {{ opt.label }}
              </div>
            </button>
          </div>
        </UCard>

        <!-- Empresa (si tiene permiso) -->
        <UCard v-if="user.canSwitchCompany" class="mb-4">
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Empresa
            </h3>
          </template>

          <USelect
            :model-value="companyStore.currentCompany"
            :items="empresas"
            icon="i-mdi-domain"
            class="w-full"
            @update:model-value="switchCompany"
          />
        </UCard>

        <!-- Notificaciones push -->
        <UCard class="mb-4">
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Notificaciones
            </h3>
          </template>

          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="font-medium text-highlighted">
                Notificaciones push
              </div>
              <div class="text-sm text-muted">
                {{ pushHint }}
              </div>
            </div>

            <div v-if="pushPermission === 'granted'" class="flex items-center gap-2">
              <UBadge
                color="success"
                variant="subtle"
                icon="i-mdi-check-circle"
                label="Activadas"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="pushBusy"
                @click="desactivarPush"
              >
                Desactivar
              </UButton>
            </div>

            <UButton
              v-else
              color="primary"
              variant="subtle"
              icon="i-mdi-bell-ring-outline"
              :loading="pushBusy"
              :disabled="pushMustInstall || pushPermission === 'denied'"
              @click="activarPush"
            >
              Activar
            </UButton>
          </div>
        </UCard>

        <!-- Aplicación -->
        <UCard class="mb-4">
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Aplicación
            </h3>
          </template>

          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div class="font-medium text-highlighted">
                Buscar actualizaciones
              </div>
              <div class="text-sm text-muted">
                Si no ves los últimos cambios, actualiza para traer la versión más reciente.
              </div>
            </div>

            <UButton
              color="primary"
              variant="subtle"
              icon="i-mdi-update"
              :loading="updating"
              @click="updateApp"
            >
              Actualizar app
            </UButton>
          </div>
        </UCard>

        <!-- Cerrar sesión -->
        <UButton
          block
          color="error"
          variant="subtle"
          size="lg"
          icon="i-mdi-logout"
          @click="logout"
        >
          Cerrar sesión
        </UButton>
      </div>
    </template>
  </UDashboardPanel>
</template>
