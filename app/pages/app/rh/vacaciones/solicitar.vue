<script setup>
// Módulo de Recursos Humanos: solicitud de vacaciones.
// El origen (SolicitarVacaciones.vue) es una pantalla informativa: el flujo real
// de solicitud vive en /app/rh/vacaciones/mis-vacaciones.
</script>

<template>
  <UDashboardPanel id="rh-solicitar-vacaciones">
    <template #header>
      <UDashboardNavbar title="Solicitud de Vacaciones">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <div class="flex flex-col items-center text-center py-10 px-6">
          <UIcon
            name="i-mdi-island"
            class="size-24 text-primary mb-4"
          />

          <h1 class="text-3xl font-bold text-highlighted">
            Solicitud de Vacaciones
          </h1>

          <p class="text-muted mt-2">
            Este módulo de Recursos Humanos está en desarrollo.
          </p>

          <div class="mt-6 flex flex-wrap gap-3 justify-center">
            <UButton
              icon="i-mdi-arrow-left"
              to="/app/dashboard"
            >
              Volver al Inicio
            </UButton>

            <UButton
              color="neutral"
              variant="outline"
              icon="i-mdi-calendar-account"
              to="/app/rh/vacaciones/mis-vacaciones"
            >
              Ir a Mis Vacaciones
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
