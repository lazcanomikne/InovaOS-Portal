// Módulo InovaOS dentro del portal. Todo pasa por el proxy /api/inovaos/* del
// backend, que reenvía a la API de InovaOS (única fuente de verdad de las reglas).
import { defineStore } from 'pinia'
import axios from '~/utils/axios'
import { useAuthStore } from '~/stores/auth'

export const useInovaosStore = defineStore('inovaos', {
  state: () => ({
    pendientes: [], // activos
    archivados: [],
    archivadosCargados: false,
    usuarios: [],
    myId: null, // id del usuario actual dentro de InovaOS (mapeado por correo)
    myRol: null,
    loading: false,
    // Pila seleccionada en Pendientes (la fija Inicio al tocar una tarjeta del semáforo)
    filtro: 'inmediata',
    // Detalle (drawer compartido entre submenús)
    detalle: null, // { pendiente, historial, checklist, evidencias }
    loadingDetalle: false,
    drawerOpen: false,
    // Tablero / métricas
    resumen: { semaforo: {}, proximos: [] },
    loadingResumen: false,
    metricas: { direccion: false, colaboradores: [] },
    loadingMetricas: false
  }),
  getters: {
    habilitado: s => s.myId != null
  },
  actions: {
    setFiltro(f) { this.filtro = f },

    async fetchUsuarios() {
      try {
        const { data } = await axios.get('/inovaos/usuarios')
        this.usuarios = data || []
        const email = (useAuthStore().user?.email || '').toLowerCase()
        const me = this.usuarios.find(u => (u.email || '').toLowerCase() === email)
        this.myId = me ? Number(me.id) : null
        this.myRol = me ? me.rol : null
      } catch { /* silencioso */ }
    },
    async fetchPendientes() {
      this.loading = true
      try {
        const { data } = await axios.get('/inovaos/pendientes')
        this.pendientes = data || []
      } catch {
        this.pendientes = []
      } finally {
        this.loading = false
      }
    },
    async fetchArchivados() {
      try {
        const { data } = await axios.get('/inovaos/pendientes', { params: { archivados: 1 } })
        this.archivados = data || []
        this.archivadosCargados = true
      } catch { /* silencioso */ }
    },
    async fetchResumen() {
      this.loadingResumen = true
      try {
        const { data } = await axios.get('/inovaos/tablero')
        this.resumen = { semaforo: data.semaforo || {}, proximos: data.proximos || [] }
      } catch {
        this.resumen = { semaforo: {}, proximos: [] }
      } finally {
        this.loadingResumen = false
      }
    },
    async fetchMetricas() {
      this.loadingMetricas = true
      try {
        const { data } = await axios.get('/inovaos/tablero', { params: { metricas: 1 } })
        this.metricas = { direccion: !!data.direccion, colaboradores: data.colaboradores || [] }
      } catch {
        this.metricas = { direccion: false, colaboradores: [] }
      } finally {
        this.loadingMetricas = false
      }
    },
    async fetchDetalle(id) {
      this.loadingDetalle = true
      try {
        const { data } = await axios.get(`/inovaos/pendientes/${id}`)
        this.detalle = data
      } catch {
        this.detalle = null
      } finally {
        this.loadingDetalle = false
      }
    },
    async abrirDetalle(id) {
      this.drawerOpen = true
      this.detalle = null
      await this.fetchDetalle(id)
    },
    cerrarDetalle() { this.drawerOpen = false },

    // Refresco de lo que esté cargado (activos + resumen; archivados si ya se vieron).
    async refrescar() {
      const tasks = [this.fetchPendientes(), this.fetchResumen()]
      if (this.archivadosCargados) tasks.push(this.fetchArchivados())
      await Promise.all(tasks)
    },

    // --- Escrituras (propagan el error para mostrar el mensaje del servidor) ---
    async crear(payload) {
      const { data } = await axios.post('/inovaos/pendientes', payload)
      await this.refrescar()
      return data
    },
    async patch(id, body) {
      const { data } = await axios.patch(`/inovaos/pendientes/${id}`, body)
      await this.refrescar()
      if (this.detalle?.pendiente?.id == id) await this.fetchDetalle(id)
      return data
    },
    cambiarEstatus(id, estatus, extra = {}) { return this.patch(id, { estatus, ...extra }) },
    editar(id, campos) { return this.patch(id, campos) },
    async archivar(id, val) {
      await axios.patch(`/inovaos/pendientes/${id}`, { archivado: val ? 1 : 0 })
      await this.refrescar()
    },
    async eliminar(id) {
      await axios.delete(`/inovaos/pendientes/${id}`)
      this.detalle = null
      this.drawerOpen = false
      await this.refrescar()
    },
    // Checklist (usa ?item= como la API de InovaOS)
    async addChecklist(pendienteId, texto) {
      await axios.post('/inovaos/checklist', { pendiente_id: pendienteId, texto })
      await this.fetchDetalle(pendienteId)
    },
    async toggleChecklist(itemId, completado, pendienteId) {
      await axios.patch('/inovaos/checklist', { completado: completado ? 1 : 0 }, { params: { item: itemId } })
      await this.fetchDetalle(pendienteId)
    },
    async delChecklist(itemId, pendienteId) {
      await axios.delete('/inovaos/checklist', { params: { item: itemId } })
      await this.fetchDetalle(pendienteId)
    }
  }
})
