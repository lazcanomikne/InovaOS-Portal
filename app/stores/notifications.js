// Notificaciones: fuente de verdad del backend + contador de no leídas.
// El sondeo periódico asegura que los admin vean los eventos en segundos
// aunque el push no llegue o el dispositivo no esté instalado.
import { defineStore } from 'pinia'
import axios from '~/utils/axios'

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    items: [],
    unread: 0,
    drawer: false,
    loading: false,
    _lastClosed: 0
  }),
  actions: {
    async fetch() {
      try {
        const { data } = await axios.get('/notifications')
        this.items = data.items || []
        this.unread = data.unread || 0
      } catch {
        /* silencioso: sin conexión no rompemos la UI */
      }
    },
    markClosed() { this._lastClosed = Date.now() },
    toggleDrawer() {
      if (this.drawer) { this.drawer = false; return }
      if (Date.now() - this._lastClosed < 350) return
      this.openDrawer()
    },
    async openDrawer() {
      this.drawer = true
      await this.fetch()
      if (this.unread > 0) this.markAllRead()
    },
    async markAllRead() {
      const prev = this.unread
      this.unread = 0
      this.items = this.items.map(n => ({ ...n, IsRead: 1 }))
      try {
        await axios.post('/notifications/read', { all: true })
      } catch {
        this.unread = prev // revertir si falló
      }
    }
  }
})
