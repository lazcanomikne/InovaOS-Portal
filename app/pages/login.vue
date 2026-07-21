<script setup>
// Acceso passwordless de 2 pasos: correo -> código de 6 dígitos -> JWT.
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: false })

const authStore = useAuthStore()

const email = ref('')
const code = ref('')

const paso = computed(() => authStore.step)

const enviarCodigo = async () => {
  if (!email.value) return
  await authStore.requestLoginCode(email.value)
}

const verificarCodigo = async () => {
  if (!code.value) return
  const ok = await authStore.verifyLoginCode(code.value)
  if (ok) await navigateTo('/app/dashboard')
}
</script>

<template>
  <div class="min-h-screen flex">
    <!-- Panel del formulario -->
    <div class="w-full lg:w-2/5 flex items-center justify-center p-8 bg-default">
      <div class="w-full max-w-md">
        <div class="mb-10">
          <h1 class="text-4xl font-black text-primary">
            Inovatech
          </h1>
          <p class="text-muted">
            Portal Corporativo
          </p>
        </div>

        <h2 class="text-2xl font-bold text-highlighted mb-2">
          ¡Bienvenido!
        </h2>
        <p class="text-muted mb-8">
          {{ paso === 1
            ? 'Ingresa tu correo para recibir un código.'
            : 'Ingresa el código que enviamos a tu correo.' }}
        </p>

        <!-- PASO 1: correo -->
        <template v-if="paso === 1">
          <UFormField
            label="Correo electrónico"
            :error="authStore.error"
            class="mb-6"
          >
            <UInput
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="ejemplo@inovatech.com.mx"
              icon="solar:letter-bold-duotone"
              size="xl"
              class="w-full"
              @keyup.enter="enviarCodigo"
            />
          </UFormField>

          <UButton
            block
            size="xl"
            :loading="authStore.loading"
            :disabled="!email"
            @click="enviarCodigo"
          >
            Enviar código
          </UButton>
        </template>

        <!-- PASO 2: código -->
        <template v-else>
          <UAlert
            icon="solar:info-circle-bold-duotone"
            color="neutral"
            variant="subtle"
            :title="authStore.tempEmail"
            description="Código enviado a este correo"
            class="mb-6"
          />

          <UFormField
            label="Código de verificación"
            :error="authStore.error"
            class="mb-4"
          >
            <UInput
              v-model="code"
              inputmode="numeric"
              maxlength="6"
              placeholder="000000"
              size="xl"
              class="w-full"
              :ui="{ base: 'text-center text-2xl font-bold tracking-[0.5rem]' }"
              @keyup.enter="verificarCodigo"
            />
          </UFormField>

          <UButton
            block
            size="xl"
            :loading="authStore.loading"
            :disabled="code.length < 6"
            @click="verificarCodigo"
          >
            Iniciar sesión
          </UButton>

          <UButton
            block
            variant="ghost"
            color="neutral"
            class="mt-3"
            @click="authStore.step = 1"
          >
            ¿Correo incorrecto? Cambiar
          </UButton>
        </template>

        <p class="mt-10 text-center text-xs text-dimmed">
          &copy; {{ new Date().getFullYear() }} Inovatech Systems. Todos los derechos reservados.
        </p>
      </div>
    </div>

    <!-- Panel decorativo (sólo escritorio) -->
    <div class="hidden lg:flex lg:w-3/5 items-center justify-center bg-elevated/40 relative overflow-hidden">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,var(--ui-primary)/8%,transparent_60%)]" />
      <div class="relative text-center px-16">
        <UIcon
          name="solar:chart-square-bold-duotone"
          class="size-40 text-primary/80 mx-auto"
        />
        <h2 class="text-4xl font-black text-highlighted mt-10 mb-4">
          Eficiencia y Control
        </h2>
        <p class="text-lg text-muted max-w-xl mx-auto">
          Gestiona todas tus operaciones corporativas en una sola plataforma
          unificada con la mayor seguridad.
        </p>
      </div>
    </div>
  </div>
</template>
