export default defineAppConfig({
  ui: {
    colors: {
      // Paleta de marca Inovatech (escalas definidas en assets/css/main.css):
      //   inovatech = azul #0096D5, ink = gris oscuro #2C3038
      primary: 'inovatech',
      neutral: 'ink'
    },

    // El body del panel ya trae `flex flex-col flex-1 overflow-y-auto`, pero sin
    // `min-h-0` no puede encogerse por debajo de su contenido (los elementos
    // flex usan `min-height: auto`). Con listas largas el body crecía más que
    // el viewport, el overflow-y-auto nunca se activaba y el `overflow-hidden`
    // de UDashboardGroup recortaba el resto: la página no scrolleaba.
    dashboardPanel: {
      slots: {
        body: 'min-h-0'
      }
    },

    // Barra de título teñida con el color de la empresa activa. Se aplica desde
    // el tema para cubrir las 38 páginas sin editarlas una por una.
    dashboardNavbar: {
      slots: {
        root: 'empresa-barra-titulo',
        title: 'text-white',
        icon: 'text-white',
        toggle: 'text-white'
      }
    },

    // El botón de colapsar el sidebar vive sobre la barra teñida.
    dashboardSidebarCollapse: {
      base: 'text-white hover:bg-white/15'
    },

    // El sidebar conserva su fondo original; sólo se le añade el mismo relieve
    // que la barra de título, proyectado hacia el contenido.
    dashboardSidebar: {
      slots: {
        root: 'empresa-sombra-lateral'
      }
    }
  }
})
