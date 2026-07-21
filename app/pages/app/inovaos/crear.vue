<script setup>
// InovaOS — Nuevo pendiente. Portado de views/inovaos/InovaCrear.vue (Vuetify 3).
//
// El `onMounted` original sólo hacía `if (!store.usuarios.length) store.fetchUsuarios()`,
// que ahora resuelve InovaAcceso (misma guardia que traía InovaLayout.vue).
import { useInovaosStore } from '~/stores/inovaos'
import { msgError } from '~/utils/inova-helpers'
import InovaTabs from '~/components/inovaos/InovaTabs.vue'
import InovaAcceso from '~/components/inovaos/InovaAcceso.vue'
import InovaForm from '~/components/inovaos/InovaForm.vue'

const store = useInovaosStore()
const toast = useToast()
const notificar = (texto, color = 'success') => toast.add({ title: texto, color })

const guardando = ref(false)

const crear = async (payload) => {
  guardando.value = true
  try {
    await store.crear(payload)
    notificar('Pendiente creado')
    navigateTo('/app/inovaos/pendientes')
  } catch (err) {
    notificar(msgError(err), 'error')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="inovaos-crear">
    <template #header>
      <UDashboardNavbar title="Nuevo pendiente">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-mdi-arrow-left"
            to="/app/inovaos/pendientes"
          >
            Volver
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <InovaTabs />

      <InovaAcceso>
        <div class="mx-auto w-full max-w-xl">
          <div class="mb-5 flex items-center gap-2">
            <UIcon name="i-mdi-plus-circle-outline" class="size-6 text-primary" />
            <div>
              <h1 class="text-xl font-bold text-highlighted">
                Nuevo pendiente
              </h1>
              <p class="text-sm text-muted">
                Captura o delega un pendiente. Si eliges un responsable, se le notifica.
              </p>
            </div>
          </div>

          <div class="rounded-2xl border border-default bg-default p-5">
            <InovaForm :initial="{}" :loading="guardando" @submit="crear" />
          </div>
        </div>
      </InovaAcceso>
    </template>
  </UDashboardPanel>
</template>
