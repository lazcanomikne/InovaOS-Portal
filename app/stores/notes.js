// Notas con menciones.
import { defineStore } from 'pinia'
import axios from '~/utils/axios'

export const useNotesStore = defineStore('notes', {
  state: () => ({
    active: [],
    done: [],
    users: [],
    loading: false
  }),
  actions: {
    async fetch(status = 'active') {
      this.loading = true
      try {
        const { data } = await axios.get('/notes', { params: { status } })
        if (status === 'done') this.done = data || []
        else this.active = data || []
      } catch { /* silencioso */ } finally {
        this.loading = false
      }
    },
    async fetchUsers() {
      try {
        const { data } = await axios.get('/notes/users')
        this.users = data || []
      } catch { /* silencioso */ }
    },
    async create(body, mentions) {
      await axios.post('/notes', { body, mentions })
    },
    async setStatus(id, status) {
      await axios.put(`/notes/${id}/status`, { status })
    },
    async remove(id) {
      await axios.delete(`/notes/${id}`)
    }
  }
})
