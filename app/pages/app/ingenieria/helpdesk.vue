<script setup>
// Módulo de Ingeniería: helpdesk / soporte técnico.
// El origen (ingenieria/Helpdesk.vue) es una pantalla informativa: el módulo
// todavía no tiene funcionalidad.
</script>

<template>
  <UDashboardPanel id="ingenieria-helpdesk">
    <template #header>
      <UDashboardNavbar title="Helpdesk">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <div class="flex flex-col items-center text-center py-10 px-6">
          <UIcon
            name="i-mdi-help-box"
            class="size-24 text-primary mb-4"
          />

          <h1 class="text-3xl font-bold text-highlighted">
            Ingeniería: Helpdesk
          </h1>

          <p class="text-muted mt-2">
            Este módulo de soporte técnico está en desarrollo.
          </p>

          <div class="mt-6">
            <UButton
              icon="i-mdi-arrow-left"
              to="/app/dashboard"
            >
              Volver al Inicio
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
