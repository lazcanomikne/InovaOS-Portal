// Chat interno: conversaciones, mensajes y contador de no leídos.
import { defineStore } from 'pinia'
import axios from '~/utils/axios'

export const useChatStore = defineStore('chat', {
  state: () => ({
    conversations: [],
    users: [],
    unread: 0,
    activeId: null,
    messages: [],
    other: null, // { userId, name, avatar, lastReadMsgId }
    loadingMsgs: false,
    sending: false
  }),
  actions: {
    async fetchUnread() {
      try {
        const { data } = await axios.get('/chat/unread-count')
        this.unread = data.unread || 0
      } catch { /* silencioso */ }
    },
    async fetchConversations() {
      try {
        const { data } = await axios.get('/chat/conversations')
        this.conversations = data || []
      } catch { /* silencioso */ }
    },
    async fetchUsers() {
      try {
        const { data } = await axios.get('/chat/users')
        this.users = data || []
      } catch { /* silencioso */ }
    },
    async startWith(userId) {
      const { data } = await axios.post('/chat/conversations', { userId })
      return data.convId
    },
    async openConversation(convId) {
      this.activeId = Number(convId)
      this.loadingMsgs = true
      try {
        const { data } = await axios.get(`/chat/conversations/${convId}/messages`)
        this.messages = data.messages || []
        this.other = data.other || null
        await this.markRead(convId)
      } catch {
        this.messages = []
        this.other = null
      } finally {
        this.loadingMsgs = false
      }
    },
    // Refresco ligero mientras la conversación está abierta.
    async refreshActive() {
      if (!this.activeId) return
      try {
        const { data } = await axios.get(`/chat/conversations/${this.activeId}/messages`)
        const hadNew = (data.messages || []).length !== this.messages.length
        this.messages = data.messages || []
        this.other = data.other || null
        if (hadNew) this.markRead(this.activeId)
      } catch { /* silencioso */ }
    },
    async sendMessage(body, image = null) {
      const text = (body || '').trim()
      if (!this.activeId || (!text && !image)) return
      this.sending = true
      try {
        const { data } = await axios.post(`/chat/conversations/${this.activeId}/messages`, { body: text, image })
        this.messages.push(data)
        this.fetchConversations()
      } catch { /* silencioso */ } finally {
        this.sending = false
      }
    },
    async markRead(convId) {
      try {
        await axios.post(`/chat/conversations/${convId}/read`)
        this.fetchUnread()
      } catch { /* silencioso */ }
    },
    clearActive() {
      this.activeId = null
      this.messages = []
      this.other = null
    }
  }
})
