<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from '~/utils/axios'
import { useCompanyStore } from '~/stores/company'

// Vista de impresión: sin layout del portal.
definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const companyStore = useCompanyStore()

// Logo de la empresa actual para fondo blanco (papel)
const printLogo = computed(() => companyStore.company?.printLogo || companyStore.company?.logo)

const loading = ref(false)
const detail = ref(null)
const error = ref(null)
const folio = computed(() => route.params.folio)

const fetchDetail = async () => {
  loading.value = true
  error.value = null
  try {
    const params = route.query.sourceCompany ? { sourceCompany: route.query.sourceCompany } : {}
    const res = await axios.get(`/crm/pipeline/detail/${folio.value}`, { params })
    detail.value = res.data
  } catch (e) {
    error.value = e.response?.data?.msg || 'Error obteniendo cotización'
  } finally {
    loading.value = false
  }
}

watch(folio, fetchDetail)
onMounted(fetchDetail)

const print = () => window.print()
const close = () => {
  if (window.history.length > 1) window.history.back()
  else router.push('/app/crm/pipeline')
}

// Sustituye ItemCode por "Item-001", "Item-002" según índice
const lineLabel = idx => `Item-${String(idx + 1).padStart(3, '0')}`

const formatCurrency = (val, cur) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: cur || 'MXN' }).format(val || 0)

const formatNumber = val =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0)

const formatDate = date => date ? new Date(date).toLocaleDateString('es-MX') : 'N/A'
</script>

<template>
  <div class="print-view">
    <!-- Toolbar superior (oculta al imprimir) -->
    <div class="print-toolbar no-print">
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-mdi-arrow-left"
        @click="close"
      >
        Cerrar
      </UButton>
      <div class="flex-1" />
      <UButton
        color="primary"
        icon="i-mdi-printer"
        :disabled="loading || !detail"
        @click="print"
      >
        Imprimir
      </UButton>
    </div>

    <div v-if="loading" class="flex justify-center items-center" style="min-height: 60vh;">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-16 text-primary" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-mdi-alert-circle-outline"
      :title="error"
      class="m-4"
    />

    <div v-else-if="detail" class="quote-paper mx-auto">
      <!-- Encabezado -->
      <div class="flex justify-between items-start mb-6">
        <img
          :src="printLogo"
          :alt="companyStore.company?.label"
          height="70"
          style="height: 70px;"
        >
        <div class="text-right">
          <div class="text-xl font-bold">
            COTIZACIÓN
          </div>
          <div class="text-base font-bold quote-accent">
            #{{ detail.header.Folio }}
          </div>
          <div class="text-xs quote-dim">
            {{ formatDate(detail.header.FechaContabilizacion) }}
          </div>
        </div>
      </div>

      <hr class="my-4">

      <!-- Cliente / Moneda -->
      <div class="grid grid-cols-12 gap-4 mb-6">
        <div class="col-span-6">
          <p class="label">
            Cliente
          </p>
          <p class="text-lg font-bold mb-0">
            {{ detail.header.Cliente }}
          </p>
          <p class="text-xs quote-dim">
            Condiciones de pago: Crédito 30 días
          </p>
        </div>
        <div class="col-span-6 text-right">
          <p class="label">
            Moneda
          </p>
          <p class="text-lg font-bold mb-0">
            {{ detail.header.Moneda }}
          </p>
          <p v-if="detail.header.Moneda !== 'MXN'" class="text-xs quote-dim">
            T.C.: {{ formatNumber(detail.header.TC) }}
          </p>
        </div>
      </div>

      <!-- Tabla de partidas: ItemCode REEMPLAZADO por Item-NNN -->
      <table class="lines-table">
        <thead>
          <tr>
            <th class="text-left">
              Item
            </th>
            <th class="text-left">
              Descripción
            </th>
            <th class="text-center">
              Cant.
            </th>
            <th class="text-right">
              Precio
            </th>
            <th class="text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, idx) in detail.lines" :key="line.NoLinea || idx">
            <td>{{ lineLabel(idx) }}</td>
            <td>{{ line.Descripcion }}</td>
            <td class="text-center">
              {{ line.Cantidad }}
            </td>
            <td class="text-right">
              {{ formatCurrency(line.Cantidad > 0 ? line.VentaNetaLinea / line.Cantidad : 0, detail.header.Moneda) }}
            </td>
            <td class="text-right font-bold">
              {{ formatCurrency(line.VentaNetaLinea, detail.header.Moneda) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Totales -->
      <div class="totals-block">
        <div class="totals-row">
          <span class="label">Subtotal:</span>
          <span class="font-bold">{{ formatCurrency(detail.header.Subtotal, detail.header.Moneda) }}</span>
        </div>
        <div class="totals-row">
          <span class="label">IVA:</span>
          <span class="font-bold">{{ formatCurrency(detail.header.IVA, detail.header.Moneda) }}</span>
        </div>
        <hr>
        <div class="totals-row total-final">
          <span>TOTAL:</span>
          <span>{{ formatCurrency(detail.header.Total, detail.header.Moneda) }}</span>
        </div>
      </div>

      <!-- Pie -->
      <div class="footer-note">
        Documento generado desde Portal Inovatech · Folio SAP #{{ detail.header.Folio }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* La hoja siempre es blanca (es papel), independiente del tema del portal. */
.print-view {
    background: #f4f6f8;
    min-height: 100vh;
    padding-bottom: 40px;
}

.print-toolbar {
    display: flex;
    align-items: center;
    background: #fff;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    position: sticky;
    top: 0;
    z-index: 10;
}

.quote-paper {
    background: white;
    max-width: 900px;
    margin-top: 24px;
    padding: 48px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    border-radius: 6px;
    font-family: 'Poppins', 'Roboto', sans-serif;
    color: #222;
}

.quote-accent { color: #0096D5; }
.quote-dim { color: rgba(0, 0, 0, 0.6); }

.label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.6);
    margin-bottom: 4px;
}

.lines-table {
    width: 100%;
    border-collapse: collapse;
    margin: 24px 0;
}

.lines-table th {
    background: #f0f4ff;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.04em;
    color: #0096D5;
    padding: 8px 10px;
    border-bottom: 2px solid #0096D5;
}

.lines-table td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    font-size: 13px;
    vertical-align: top;
}

.totals-block {
    margin-left: auto;
    margin-top: 24px;
    width: 280px;
    font-size: 14px;
}

.totals-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
}

.totals-block hr {
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.15);
    margin: 8px 0;
}

.total-final {
    font-size: 18px;
    font-weight: 800;
    color: #0096D5;
}

.footer-note {
    margin-top: 48px;
    text-align: center;
    font-size: 11px;
    color: rgba(0, 0, 0, 0.5);
    border-top: 1px dashed rgba(0, 0, 0, 0.1);
    padding-top: 12px;
}

/* ===== Estilos al imprimir ===== */
@media print {
    .no-print { display: none !important; }
    .print-view { background: white; padding: 0; }
    .quote-paper {
        box-shadow: none;
        margin: 0;
        padding: 24px;
        max-width: none;
        border-radius: 0;
    }
    @page { size: A4; margin: 18mm; }
}
</style>
