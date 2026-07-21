// Autenticación passwordless de 2 pasos (correo -> código de 6 dígitos -> JWT).
// Portado tal cual del portal Vuetify; sólo cambia el guard de localStorage.
import { defineStore } from 'pinia'
import axios from '~/utils/axios'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: import.meta.client ? localStorage.getItem('token') : null,
    step: 1, // 1: pedir correo, 2: pedir código
    loading: false,
    error: null,
    tempEmail: ''
  }),

  getters: {
    isAuthenticated: state => !!state.token,
    canSwitchCompany: state => !!state.user?.canSwitchCompany
  },

  actions: {
    // PASO 1: solicitar código
    async requestLoginCode(email) {
      this.loading = true
      this.error = null
      try {
        await axios.post('/auth/login-request', { email })
        this.tempEmail = email
        this.step = 2
      } catch (err) {
        this.error = err.response?.data?.msg || 'Error de conexión'
      } finally {
        this.loading = false
      }
    },

    // PASO 2: verificar código
    async verifyLoginCode(code) {
      this.loading = true
      this.error = null
      try {
        const response = await axios.post('/auth/login-verify', {
          email: this.tempEmail,
          code
        })
        this.token = response.data.token
        this.user = response.data.user
        localStorage.setItem('token', this.token)
        return true
      } catch (err) {
        this.error = err.response?.data?.msg || 'Código incorrecto'
        return false
      } finally {
        this.loading = false
      }
    },

    // Restaurar perfil al recargar
    async restoreSession() {
      if (!this.token) return
      try {
        const response = await axios.get('/auth/profile')
        this.user = response.data.user
      } catch {
        this.logout()
      }
    },

    // Actualiza perfil (avatar / tema / nombre) y refleja en el estado local
    async saveProfile(payload) {
      await axios.put('/auth/profile', payload)
      if (!this.user) this.user = {}
      if (payload.avatar !== undefined) this.user.avatar = payload.avatar
      if (payload.themePref !== undefined) this.user.themePref = payload.themePref
      if (payload.fullName) this.user.name = payload.fullName
    },

    logout() {
      this.token = null
      this.user = null
      this.step = 1
      this.tempEmail = ''
      if (import.meta.client) localStorage.removeItem('token')
    }
  }
})
