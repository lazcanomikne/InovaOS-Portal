<script setup>
// Notas del usuario con menciones (@) a otros usuarios del portal.
import { useNotesStore } from '~/stores/notes'

const notesStore = useNotesStore()
const toast = useToast()

// Sustituye a `useDisplay().smAndDown` de Vuetify (breakpoint md de Vuetify).
const smAndDown = useMediaQuery('(max-width: 959px)')

const tab = ref('active')
const dialog = ref(false)
const draft = ref('')
const saving = ref(false)
const ta = ref(null)
const notify = (text, color = 'success') => { toast.add({ title: text, color }) }

const list = computed(() => (tab.value === 'done' ? notesStore.done : notesStore.active))

const tabItems = [
  { value: 'active', label: 'Activas' },
  { value: 'done', label: 'Finalizadas' }
]

// --- Menciones (@) ---
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(0)
// UTextarea expone `textareaRef`; se deja el fallback al DOM por seguridad.
const nativeTa = () => ta.value?.textareaRef || ta.value?.$el?.querySelector('textarea')
const mentionUsers = computed(() => {
  const q = mentionQuery.value
  return notesStore.users.filter(u => (u.name || '').toLowerCase().includes(q)).slice(0, 6)
})
const selectedMentions = computed(() =>
  notesStore.users.filter(u => draft.value.includes('@' + u.name))
)
const detectMention = () => {
  const el = nativeTa()
  const pos = el ? el.selectionStart : draft.value.length
  const upto = draft.value.slice(0, pos)
  const m = upto.match(/@([^\s@]{0,40})$/)
  if (m) { mentionQuery.value = m[1].toLowerCase(); mentionStart.value = pos - m[0].length; mentionOpen.value = true } else { mentionOpen.value = false }
}
const insertMention = (u) => {
  const el = nativeTa()
  const pos = el ? el.selectionStart : draft.value.length
  const before = draft.value.slice(0, mentionStart.value)
  const after = draft.value.slice(pos)
  const insert = '@' + u.name + ' '
  draft.value = before + insert + after
  mentionOpen.value = false
  nextTick(() => {
    if (el) { const np = (before + insert).length; el.focus(); el.setSelectionRange(np, np) }
  })
}

const ini = name => (name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'U')
const fdate = iso => iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

// Resalta las @menciones dentro del cuerpo de la nota.
const parts = (note) => {
  const names = (note.mentions || []).map(m => m.name).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ t: note.body, m: false }]
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('@(' + names.map(esc).join('|') + ')', 'g')
  const out = []; let last = 0; let mt
  while ((mt = re.exec(note.body))) {
    if (mt.index > last) out.push({ t: note.body.slice(last, mt.index), m: false })
    out.push({ t: mt[0], m: true })
    last = mt.index + mt[0].length
  }
  if (last < note.body.length) out.push({ t: note.body.slice(last), m: false })
  return out
}

const openNew = async () => {
  draft.value = ''
  mentionOpen.value = false
  dialog.value = true
  if (!notesStore.users.length) await notesStore.fetchUsers()
}
const save = async () => {
  const body = draft.value.trim()
  if (!body) return
  saving.value = true
  try {
    const mentions = selectedMentions.value.map(u => u.userId)
    await notesStore.create(body, mentions)
    dialog.value = false
    notify(mentions.length ? 'Nota creada y usuarios notificados' : 'Nota creada')
    await notesStore.fetch('active')
    tab.value = 'active'
  } catch { notify('No se pudo crear la nota', 'error') } finally { saving.value = false }
}

const finish = async (n) => { await notesStore.setStatus(n.noteId, 'done'); await reload() }
const reactivate = async (n) => { await notesStore.setStatus(n.noteId, 'active'); await reload() }
const del = async (n) => { await notesStore.remove(n.noteId); await reload() }
const reload = async () => { await notesStore.fetch('active'); await notesStore.fetch('done') }

watch(tab, t => notesStore.fetch(t))

onMounted(async () => {
  await notesStore.fetch('active')
  notesStore.fetchUsers()
})
</script>

<template>
  <UDashboardPanel id="notes">
    <template #header>
      <UDashboardNavbar title="Notas">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton icon="i-mdi-plus" @click="openNew">
            Nueva nota
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl">
        <UTabs
          v-model="tab"
          :items="tabItems"
          :content="false"
          class="mb-4"
        />

        <div v-if="notesStore.loading" class="text-center py-8">
          <UIcon name="i-lucide-loader-circle" class="animate-spin size-7 text-primary" />
        </div>

        <template v-else>
          <div v-if="!list.length" class="text-center text-muted py-10">
            <UIcon name="i-mdi-note-text-outline" class="size-10 mb-2" />
            <div>{{ tab === 'active' ? 'No tienes notas activas' : 'No hay notas finalizadas' }}</div>
          </div>

          <UCard
            v-for="n in list"
            :key="n.noteId"
            class="mb-3"
          >
            <div class="whitespace-pre-wrap break-words leading-relaxed mb-2 text-highlighted">
              <span
                v-for="(p, i) in parts(n)"
                :key="i"
                :class="p.m ? 'text-primary font-semibold' : ''"
              >{{ p.t }}</span>
            </div>

            <div v-if="n.mentions && n.mentions.length" class="flex flex-wrap gap-1 mb-2">
              <UBadge
                v-for="m in n.mentions"
                :key="m.userId"
                color="primary"
                variant="subtle"
                size="sm"
                icon="i-mdi-account"
                :label="m.name"
              />
            </div>

            <div class="flex items-center justify-between flex-wrap gap-2">
              <span class="text-xs text-muted flex items-center gap-1">
                <UIcon name="i-mdi-account-edit-outline" class="size-3.5" />
                {{ n.isAuthor ? 'Tú' : n.authorName }} · {{ fdate(n.updatedAt) }}
              </span>

              <div class="flex gap-1">
                <UButton
                  v-if="n.status === 'active'"
                  size="sm"
                  variant="subtle"
                  color="success"
                  icon="i-mdi-check"
                  @click="finish(n)"
                >
                  Finalizar
                </UButton>
                <UButton
                  v-else
                  size="sm"
                  variant="subtle"
                  color="primary"
                  icon="i-mdi-refresh"
                  @click="reactivate(n)"
                >
                  Reactivar
                </UButton>

                <UButton
                  v-if="n.isAuthor"
                  size="sm"
                  variant="ghost"
                  color="error"
                  icon="i-mdi-trash-can-outline"
                  square
                  aria-label="Eliminar nota"
                  @click="del(n)"
                />
              </div>
            </div>
          </UCard>
        </template>

        <!-- Nueva nota -->
        <UModal
          v-model:open="dialog"
          title="Nueva nota"
          :fullscreen="smAndDown"
        >
          <template #body>
            <div class="text-sm text-muted mb-2">
              Escribe la nota. Usa <strong>@</strong> para mencionar a un usuario; le llegará una notificación y la verá en sus notas.
            </div>

            <div class="relative">
              <UTextarea
                ref="ta"
                v-model="draft"
                placeholder="Escribe aquí..."
                :rows="4"
                autoresize
                autofocus
                class="w-full"
                @update:model-value="detectMention"
                @keyup="detectMention"
                @click="detectMention"
              />

              <div
                v-if="mentionOpen && mentionUsers.length"
                class="absolute left-2 right-2 top-full z-30 max-h-60 overflow-y-auto rounded-xl border border-default bg-default shadow-lg py-1"
              >
                <button
                  v-for="u in mentionUsers"
                  :key="u.userId"
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-elevated transition-colors"
                  @click="insertMention(u)"
                >
                  <UAvatar
                    :src="u.avatar || undefined"
                    :text="ini(u.name)"
                    size="sm"
                  />
                  <span class="text-sm text-highlighted">{{ u.name }}</span>
                </button>
              </div>
            </div>

            <div v-if="selectedMentions.length" class="flex flex-wrap gap-1 mt-2">
              <UBadge
                v-for="m in selectedMentions"
                :key="m.userId"
                color="primary"
                variant="subtle"
                size="sm"
                icon="i-mdi-at"
                :label="m.name"
              />
            </div>
          </template>

          <template #footer>
            <div class="flex-1" />
            <UButton color="neutral" variant="ghost" @click="dialog = false">
              Cancelar
            </UButton>
            <UButton
              color="primary"
              :loading="saving"
              :disabled="!draft.trim()"
              @click="save"
            >
              Guardar
            </UButton>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
