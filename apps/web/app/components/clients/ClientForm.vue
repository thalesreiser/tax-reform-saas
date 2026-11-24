<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { Client, ClientFormInput, CnpjRecord } from "~/utils/clients"

// Create (no `client`) or edit a client. On create, a valid CNPJ is looked up (BrasilAPI via the
// API) and fills the names; any lookup failure leaves the form for manual entry. The registry
// regime is informational: it is confirmed later in the fiscal profile (BE-02.3).
const props = defineProps<{ client?: Client }>()
const emit = defineEmits<{ created: [client: Client]; saved: [client: Client] }>()
const { t } = useI18n()
const api = useClients()

const editing = computed(() => props.client !== undefined)
const schema = clientFormSchema(t, !editing.value)
const state = reactive({
  cnpj: props.client ? formatCnpj(props.client.cnpj) : "",
  legalName: props.client?.legalName ?? "",
  tradeName: props.client?.tradeName ?? "",
  notes: props.client?.notes ?? "",
})

const cnpjState = computed(() => cnpjInputState(state.cnpj))
const cnpjError = computed(() =>
  !editing.value && cnpjState.value === "invalid" ? t("clients.validation.cnpjInvalid") : undefined,
)

const record = ref<CnpjRecord | null>(null)
const lookupStatus = ref<"idle" | "loading" | "done" | "failed">("idle")
const lookupMessage = ref("")
let lookedUp = ""

function onCnpj(value: string) {
  state.cnpj = formatCnpj(value)
}

watch(cnpjState, async (value) => {
  const cnpj = normalizeCnpj(state.cnpj)
  if (value !== "valid") {
    record.value = null
    lookupStatus.value = "idle"
    lookedUp = ""
    return
  }
  if (cnpj === lookedUp) return
  lookedUp = cnpj
  lookupStatus.value = "loading"
  lookupMessage.value = t("clients.lookup.loading")
  try {
    const found = await api.lookup(cnpj)
    if (lookedUp !== cnpj) return
    record.value = found
    state.legalName = found.legalName
    state.tradeName = found.tradeName ?? ""
    lookupStatus.value = "done"
    lookupMessage.value = t("clients.lookup.filled", { at: formatFetchedAt(found.fetchedAt) })
  } catch (e) {
    if (lookedUp !== cnpj) return
    record.value = null
    lookupStatus.value = "failed"
    lookupMessage.value = t(clientErrorKey(e, "lookup"))
  }
})

const saving = ref(false)
const error = ref<string | null>(null)
const duplicateId = ref<string | null>(null)
const notice = ref<string | null>(null)
const noticeEl = useTemplateRef<HTMLElement>("notice")

const optional = (v: string) => (v.trim() === "" ? undefined : v.trim())

async function onSubmit(event: FormSubmitEvent<ClientFormInput>) {
  saving.value = true
  error.value = null
  duplicateId.value = null
  notice.value = null
  const data = event.data
  try {
    if (props.client) {
      const saved = await api.update(props.client.id, {
        legalName: data.legalName,
        tradeName: optional(data.tradeName) ?? null,
        notes: optional(data.notes) ?? null,
      })
      notice.value = t("clients.form.saved")
      emit("saved", saved)
      await nextTick()
      noticeEl.value?.focus()
      return
    }
    const cnpj = normalizeCnpj(data.cnpj)
    const created = await api.create({
      cnpj,
      legalName: data.legalName,
      tradeName: optional(data.tradeName),
      notes: optional(data.notes),
      lookup: record.value !== null,
    })
    emit("created", created)
  } catch (e) {
    const key = clientErrorKey(e, props.client ? "save" : "create")
    error.value = t(key)
    if (lookupFailed(e)) record.value = null
    if (key === "clients.errors.duplicate") {
      const cnpj = normalizeCnpj(data.cnpj)
      const page = await api.list({ q: cnpj, page: 1, pageSize: 1 }).catch(() => null)
      duplicateId.value = page?.items.find((c) => c.cnpj === cnpj)?.id ?? null
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="notice"
      ref="notice"
      tabindex="-1"
      role="status"
      class="rounded-md focus:outline-none"
    >
      <UAlert color="success" variant="subtle" :description="notice" />
    </div>
    <UAlert v-if="error" role="alert" color="error" variant="subtle">
      <template #description>
        {{ error }}
        <ULink
          v-if="duplicateId"
          :to="`/clientes/${duplicateId}`"
          class="ml-1 font-medium underline"
        >
          {{ t("clients.errors.openExisting") }}
        </ULink>
      </template>
    </UAlert>

    <UForm :schema="schema" :state="state" class="space-y-5" @submit="onSubmit">
      <UFormField
        :label="t('clients.fields.cnpj')"
        name="cnpj"
        :help="editing ? t('clients.fields.cnpjLocked') : t('clients.fields.cnpjHelp')"
        :error="cnpjError"
        :required="!editing"
      >
        <UInput
          :model-value="state.cnpj"
          name="cnpj"
          :disabled="editing"
          autocomplete="off"
          spellcheck="false"
          :maxlength="18"
          class="w-full max-w-xs font-medium tabular-nums"
          @update:model-value="onCnpj(String($event))"
        />
      </UFormField>

      <p
        v-if="!editing"
        aria-live="polite"
        class="min-h-5 text-sm"
        :class="lookupStatus === 'failed' ? 'text-warning' : 'text-muted'"
        data-lookup-status
      >
        <template v-if="lookupStatus !== 'idle'">{{ lookupMessage }}</template>
      </p>

      <dl v-if="record" class="surface-glass grid gap-3 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-muted">{{ t("clients.fields.status") }}</dt>
          <dd class="font-medium text-highlighted">
            {{ record.registrationStatus ?? t("clients.notInformed") }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">{{ t("clients.fields.regime") }}</dt>
          <dd class="font-medium text-highlighted">{{ t(regimeKey(record.taxRegime)) }}</dd>
        </div>
        <div>
          <dt class="text-muted">{{ t("clients.fields.city") }}</dt>
          <dd class="font-medium text-highlighted">
            {{
              record.address.city
                ? `${record.address.city}/${record.address.state ?? ""}`
                : t("clients.notInformed")
            }}
          </dd>
        </div>
        <p class="text-muted sm:col-span-3">{{ t("clients.lookup.regimeNote") }}</p>
      </dl>

      <UFormField :label="t('clients.fields.legalName')" name="legalName" required>
        <UInput
          v-model="state.legalName"
          name="legalName"
          autocomplete="organization"
          class="w-full"
        />
      </UFormField>
      <UFormField :label="t('clients.fields.tradeName')" name="tradeName">
        <UInput v-model="state.tradeName" name="tradeName" class="w-full" />
      </UFormField>
      <UFormField
        :label="t('clients.fields.notes')"
        name="notes"
        :help="t('clients.fields.notesHelp')"
      >
        <UTextarea v-model="state.notes" name="notes" :rows="3" class="w-full" />
      </UFormField>

      <div class="flex flex-wrap gap-3">
        <UButton type="submit" size="lg" :loading="saving">
          {{ editing ? t("clients.form.save") : t("clients.form.create") }}
        </UButton>
        <UButton to="/clientes" color="neutral" variant="ghost" size="lg">
          {{ t("clients.form.back") }}
        </UButton>
      </div>
    </UForm>
  </div>
</template>
