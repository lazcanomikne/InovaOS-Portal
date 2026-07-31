// Barra superior (KPIs/acciones) que se queda pegada arriba y se compacta al
// hacer scroll de la página, con el encabezado de la tabla anclado justo debajo.
// Es la misma mecánica de Caja Chica, extraída para reutilizarla en las
// pantallas del CRM.
//
// Uso en una página:
//   const { compacto, barraRef, centinelaRef } = useBarraCompacta()
//   - pon <div ref="centinelaRef" class="h-px w-full" /> como primer elemento
//     del cuerpo (marca el tope del contenido).
//   - pon ref="barraRef" en el contenedor sticky de los KPIs.
//   - usa `compacto` para encoger los KPIs.
//   - en la tabla ancla el thead a top: var(--barra-h) (el alto real de la barra
//     se publica solo).
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

export function useBarraCompacta() {
  const compacto = ref(false)
  const barraRef = ref(null)
  const centinelaRef = ref(null)
  let ro = null   // observa el alto de la barra
  let io = null   // detecta si ya se hizo scroll

  const medirBarra = () => {
    if (barraRef.value) {
      document.documentElement.style.setProperty('--barra-h', barraRef.value.offsetHeight + 'px')
    }
  }

  onMounted(() => {
    nextTick(() => {
      if (centinelaRef.value) {
        io = new IntersectionObserver(
          ([e]) => { compacto.value = !e.isIntersecting },
          { threshold: 0 }
        )
        io.observe(centinelaRef.value)
      }
      if (barraRef.value) {
        ro = new ResizeObserver(medirBarra)
        ro.observe(barraRef.value)
      }
      medirBarra()
    })
  })

  onUnmounted(() => {
    ro?.disconnect()
    io?.disconnect()
  })

  return { compacto, barraRef, centinelaRef }
}
