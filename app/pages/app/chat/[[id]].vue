<script setup>
// Chat interno: lista de conversaciones + hilo activo.
// Ruta opcional: /app/chat (sin conversación) y /app/chat/:id (conversación abierta).
import { useChatStore } from '~/stores/chat'
import { useAuthStore } from '~/stores/auth'

const chat = useChatStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// Sustituye a `useDisplay().smAndDown` de Vuetify (breakpoint md).
const smAndDown = useMediaQuery('(max-width: 959px)')

// En rutas opcionales el parámetro puede llegar como arreglo: se normaliza.
const routeId = computed(() => {
  const p = route.params.id
  const v = Array.isArray(p) ? p[0] : p
  return v || null
})

const myId = computed(() => authStore.user?.uid)
const draft = ref('')
const newDialog = ref(false)
const userSearch = ref('')
const scrollBox = ref(null)
const fileInput = ref(null)
const imgViewer = ref(false)
const viewerSrc = ref('')
let timer = null

const showList = computed(() => !smAndDown.value || !chat.activeId)
const showThread = computed(() => !smAndDown.value || !!chat.activeId)

const usersFiltered = computed(() => {
  const q = userSearch.value.trim().toLowerCase()
  if (!q) return chat.users
  return chat.users.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
})

const ini = (name) => {
  if (!name) return 'U'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}
const time = iso => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
const rel = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'ahora'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  if (s < 604800) return `${Math.floor(s / 86400)} d`
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}
const isRead = m => chat.other && chat.other.lastReadMsgId >= m.msgId

const scrollBottom = () => nextTick(() => { if (scrollBox.value) scrollBox.value.scrollTop = scrollBox.value.scrollHeight })

const select = convId => router.push(`/app/chat/${convId}`)
const back = () => { chat.clearActive(); router.push('/app/chat') }

const openNew = async () => { newDialog.value = true; userSearch.value = ''; await chat.fetchUsers() }
const startChat = async (u) => {
  try {
    const convId = await chat.startWith(u.userId)
    newDialog.value = false
    await chat.fetchConversations()
    router.push(`/app/chat/${convId}`)
  } catch { /* noop */ }
}

const send = async () => {
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  await chat.sendMessage(text)
  scrollBottom()
}

// --- Adjuntar imagen (usa la cámara / galería del teléfono) ---
const pickImage = () => fileInput.value?.click()
const resizeImage = (file, maxDim = 1024, quality = 0.6) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = reject
  reader.onload = () => {
    const img = new Image()
    img.onerror = reject
    img.onload = () => {
      let { width, height } = img
      if (Math.max(width, height) > maxDim) {
        const s = maxDim / Math.max(width, height)
        width = Math.round(width * s); height = Math.round(height * s)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = reader.result
  }
  reader.readAsDataURL(file)
})
const onImage = async (e) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const dataUrl = await resizeImage(file)
    const caption = draft.value.trim()
    draft.value = ''
    await chat.sendMessage(caption, dataUrl)
    scrollBottom()
  } catch { /* noop */ }
}
const viewImage = (src) => { viewerSrc.value = src; imgViewer.value = true }

const loadFromRoute = async () => {
  const id = routeId.value
  if (id) { await chat.openConversation(id); scrollBottom() } else chat.clearActive()
}

watch(routeId, loadFromRoute)
watch(() => chat.messages.length, scrollBottom)

onMounted(async () => {
  await chat.fetchConversations()
  await loadFromRoute()
  // Refresco periódico: no leídos + hilo activo (o la lista si no hay hilo).
  timer = setInterval(() => {
    chat.fetchUnread()
    if (chat.activeId) chat.refreshActive()
    else chat.fetchConversations()
  }, 4000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <UDashboardPanel
    id="chat"
    :ui="{ body: 'p-0 sm:p-0 gap-0 overflow-hidden' }"
  >
    <template #header>
      <UDashboardNavbar title="Mensajes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-mdi-plus"
            color="primary"
            variant="subtle"
            square
            aria-label="Nuevo chat"
            @click="openNew"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 w-full">
        <!-- ===== Lista de conversaciones ===== -->
        <div
          v-show="showList"
          class="flex flex-col overflow-y-auto w-full lg:w-[340px] lg:shrink-0 lg:border-r border-default"
        >
          <div
            v-if="!chat.conversations.length"
            class="text-center text-muted py-10 px-4"
          >
            <UIcon name="i-mdi-message-text-outline" class="size-10 mb-2" />
            <div>No tienes conversaciones</div>
            <UButton
              class="mt-3"
              color="primary"
              variant="subtle"
              icon="i-mdi-plus"
              @click="openNew"
            >
              Nuevo chat
            </UButton>
          </div>

          <template v-else>
            <button
              v-for="c in chat.conversations"
              :key="c.convId"
              type="button"
              class="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-default transition-colors"
              :class="c.convId === chat.activeId ? 'bg-elevated' : 'hover:bg-elevated/60'"
              @click="select(c.convId)"
            >
              <UAvatar
                :src="c.other && c.other.avatar ? c.other.avatar : undefined"
                :text="ini(c.other && c.other.name)"
                size="lg"
              />

              <div class="min-w-0 flex-1">
                <div class="flex justify-between gap-2">
                  <span class="font-bold text-highlighted truncate">{{ c.other ? c.other.name : 'Usuario' }}</span>
                  <span class="text-xs text-muted shrink-0">{{ c.lastMessage ? rel(c.lastMessage.createdAt) : '' }}</span>
                </div>

                <div class="flex justify-between items-center gap-2">
                  <span class="text-sm text-muted truncate">
                    <span v-if="c.lastMessage && c.lastMessage.senderId === myId">Tú: </span>
                    <template v-if="c.lastMessage && c.lastMessage.msgType === 'image'">
                      <UIcon name="i-mdi-image-outline" class="size-3.5 align-text-bottom" /> Foto
                    </template>
                    <template v-else>{{ c.lastMessage ? c.lastMessage.body : 'Inicia la conversación' }}</template>
                  </span>

                  <UBadge
                    v-if="c.unread > 0"
                    color="error"
                    size="sm"
                    class="shrink-0"
                    :label="String(c.unread)"
                  />
                </div>
              </div>
            </button>
          </template>
        </div>

        <!-- ===== Hilo de la conversación ===== -->
        <div v-show="showThread" class="flex-1 flex flex-col min-w-0 min-h-0">
          <template v-if="chat.activeId">
            <div class="flex items-center gap-2 px-3 py-2 border-b border-default shrink-0">
              <UButton
                v-if="smAndDown"
                icon="i-mdi-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                square
                aria-label="Volver"
                @click="back"
              />
              <UAvatar
                :src="chat.other && chat.other.avatar ? chat.other.avatar : undefined"
                :text="ini(chat.other && chat.other.name)"
              />
              <div class="font-bold text-highlighted truncate">
                {{ chat.other ? chat.other.name : 'Conversación' }}
              </div>
            </div>

            <div
              ref="scrollBox"
              class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-4 py-3.5"
            >
              <div v-if="chat.loadingMsgs" class="text-center py-6">
                <UIcon name="i-lucide-loader-circle" class="animate-spin size-7 text-primary" />
              </div>

              <template v-else>
                <div
                  v-for="m in chat.messages"
                  :key="m.msgId"
                  class="flex"
                  :class="{ 'justify-end': m.senderId === myId }"
                >
                  <div
                    class="max-w-[76%] rounded-2xl"
                    :class="[
                      m.senderId === myId
                        ? 'bg-primary text-inverted rounded-br-sm'
                        : 'bg-elevated border border-default text-highlighted rounded-bl-sm',
                      m.msgType === 'image' ? 'p-1' : 'px-3 py-2'
                    ]"
                  >
                    <img
                      v-if="m.msgType === 'image' && m.attachment"
                      :src="m.attachment"
                      class="block max-w-[220px] max-h-[280px] object-cover rounded-lg cursor-pointer"
                      alt="Imagen del mensaje"
                      @click="viewImage(m.attachment)"
                    >

                    <div
                      v-if="m.body"
                      class="whitespace-pre-wrap break-words text-[0.95rem] leading-snug"
                      :class="{ 'mt-1 px-1.5': m.msgType === 'image' }"
                    >
                      {{ m.body }}
                    </div>

                    <div
                      class="flex items-center justify-end gap-0.5 mt-0.5"
                      :class="{ 'px-1.5 pb-0.5': m.msgType === 'image' }"
                    >
                      <span class="text-[0.68rem] opacity-70">{{ time(m.createdAt) }}</span>
                      <UIcon
                        v-if="m.senderId === myId"
                        name="i-mdi-check-all"
                        class="size-4 ml-0.5"
                        :class="isRead(m) ? 'text-sky-300' : 'opacity-75'"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <div class="flex items-end gap-2 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] border-t border-default shrink-0">
              <UButton
                icon="i-mdi-image-plus-outline"
                color="primary"
                variant="ghost"
                square
                :loading="chat.sending"
                aria-label="Adjuntar imagen"
                @click="pickImage"
              />
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                hidden
                @change="onImage"
              >

              <UTextarea
                v-model="draft"
                placeholder="Escribe un mensaje..."
                :rows="1"
                :maxrows="5"
                autoresize
                class="flex-1"
                @keydown.enter.exact.prevent="send"
              />

              <UButton
                icon="i-mdi-send"
                color="primary"
                square
                :loading="chat.sending"
                :disabled="!draft.trim()"
                aria-label="Enviar"
                @click="send"
              />
            </div>
          </template>

          <div v-else class="flex-1 flex flex-col items-center justify-center text-center p-6">
            <UIcon name="i-mdi-send-outline" class="size-14 text-primary mb-2" />
            <div class="text-muted">
              Selecciona una conversación o inicia una nueva
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Nuevo chat: elegir usuario ===== -->
      <UModal v-model:open="newDialog" title="Nuevo chat">
        <template #body>
          <UInput
            v-model="userSearch"
            placeholder="Buscar usuario"
            icon="i-mdi-magnify"
            class="w-full mb-2"
          />

          <div class="max-h-90 overflow-y-auto">
            <button
              v-for="u in usersFiltered"
              :key="u.userId"
              type="button"
              class="w-full flex items-center gap-3 px-2 py-2 text-left rounded-lg hover:bg-elevated transition-colors"
              @click="startChat(u)"
            >
              <UAvatar
                :src="u.avatar || undefined"
                :text="ini(u.name)"
              />
              <div class="min-w-0">
                <div class="font-medium text-highlighted truncate">
                  {{ u.name }}
                </div>
                <div class="text-sm text-muted truncate">
                  {{ u.email }}
                </div>
              </div>
            </button>

            <div v-if="!usersFiltered.length" class="text-center text-muted py-6">
              Sin resultados
            </div>
          </div>
        </template>
      </UModal>

      <!-- Visor de imagen a pantalla completa -->
      <UModal v-model:open="imgViewer" fullscreen>
        <template #content>
          <div
            class="flex items-center justify-center w-full h-full cursor-zoom-out bg-default"
            @click="imgViewer = false"
          >
            <img
              :src="viewerSrc"
              class="max-w-full max-h-[88vh] object-contain"
              alt="Imagen"
            >
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
