<script setup>
// Acceso passwordless de 2 pasos: correo -> código de 6 dígitos -> JWT.
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: false })

const authStore = useAuthStore()

const email = ref('')
const code = ref('')

// El fondo del panel derecho es un video. Quien pidió menos animación en su
// sistema ve el cuadro fijo en su lugar.
const menosMovimiento = useMediaQuery('(prefers-reduced-motion: reduce)')

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
    <!-- Panel del formulario.
         Monta sobre el panel derecho con `panel-login-relieve`: la sombra que
         proyecta a su canto es lo que da la sensación de que está por encima. -->
    <div class="panel-login-relieve w-full lg:w-2/5 flex items-center justify-center p-8 bg-default relative z-10">
      <div class="w-full max-w-md">
        <div class="mb-10">
          <!-- El logotipo es negro, así que en tema oscuro se invierte para que
               no desaparezca contra el fondo. -->
          <img
            src="/logo-inicio.png"
            alt="Inovatech"
            class="h-24 lg:h-28 w-auto mb-4 -ml-1 dark:invert"
          >
          <p class="text-lg font-semibold tracking-wide text-primary">
            InovaOS
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

    <!-- Panel decorativo (sólo escritorio).
         Sólo la marca: la pieza ya trae su propio mensaje, así que cualquier
         texto encima competiría con el del anuncio.
         `object-cover` recorta en vez de deformar. -->
    <div class="hidden lg:block lg:w-3/5 relative overflow-hidden bg-black">
      <!-- Con `prefers-reduced-motion` se muestra el cuadro fijo en vez del
           video. Un fondo en movimiento constante molesta a quien pidió menos
           animación, y el navegador no lo respeta por su cuenta. -->
      <img
        v-if="menosMovimiento"
        src="/fondo-inicio.webp"
        alt="Inovatech, built for what's next"
        class="absolute inset-0 w-full h-full object-cover"
        style="object-position: 30% 45%"
      >

      <!-- `muted` y `playsinline` no son opcionales: sin ellos los navegadores
           bloquean la reproducción automática, y en iOS el video se abriría a
           pantalla completa. El `poster` es la imagen que ya teníamos, así que
           se ve el encuadre correcto mientras carga en vez de un hueco negro.

           `object-position` al 30% horizontal: el anuncio está a la izquierda
           del cuadro y el panel es más alto que ancho, así que un recorte
           centrado se lo comía por el borde. -->
      <video
        v-else
        src="/fondo-inicio.mp4"
        poster="/fondo-inicio.webp"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        aria-label="Inovatech, built for what's next"
        class="absolute inset-0 w-full h-full object-cover"
        style="object-position: 30% 45%"
      />

      <!-- Iluminación nocturna. Tres capas que se suman:
           el resplandor frío alrededor del anuncio, como si el panel iluminara
           la escena; el enfriado general hacia las sombras; y la viñeta que
           cierra las esquinas. Van sobre el video, no como filtro, para no
           apagar el azul del anuncio, que es lo que debe brillar. -->
      <div
        class="pointer-events-none absolute inset-0 mix-blend-screen"
        style="background: radial-gradient(ellipse 55% 45% at 34% 42%, rgba(0,150,213,0.30), transparent 70%)"
      />
      <div
        class="pointer-events-none absolute inset-0"
        style="background: linear-gradient(180deg, rgba(3,10,20,0.55) 0%, rgba(3,12,24,0.12) 42%, rgba(2,8,18,0.68) 100%)"
      />
      <div
        class="pointer-events-none absolute inset-0"
        style="background: radial-gradient(ellipse 80% 70% at 34% 45%, transparent 30%, rgba(1,6,14,0.62) 100%)"
      />
    </div>
  </div>
</template>
