<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { OfficeSettings, ProfileInput } from "~/utils/office"

// Office profile shown on reports (RF-01): owners edit it, accountants read it.
const props = defineProps<{ settings: OfficeSettings }>()
const emit = defineEmits<{ saved: [settings: OfficeSettings] }>()
const { t } = useI18n()
const api = useOfficeSettings()
const canEdit = computed(() => props.settings.role === "owner")

const schema = profileSchema(t)
const state = reactive({
  name: props.settings.name,
  cnpj: props.settings.cnpj ? formatCnpj(props.settings.cnpj) : "",
  contactEmail: props.settings.contactEmail ?? "",
  contactPhone: props.settings.contactPhone ?? "",
})

const saving = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const noticeEl = useTemplateRef<HTMLElement>("notice")
const orNull = (v: string) => (v.trim() === "" ? null : v.trim())

async function onSubmit(event: FormSubmitEvent<ProfileInput>) {
  saving.value = true
  error.value = null
  notice.value = null
  const data = event.data
  try {
    const saved = await api.update({
      name: data.name,
      cnpj: orNull(data.cnpj) === null ? null : normalizeCnpj(data.cnpj),
      contactEmail: orNull(data.contactEmail),
      contactPhone: orNull(data.contactPhone),
    })
    notice.value = t("office.profile.saved")
    emit("saved", saved)
    await nextTick()
    noticeEl.value?.focus()
  } catch (e) {
    error.value = t(officeErrorKey(e, "save"))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <p v-if="!canEdit" class="text-sm text-muted" data-readonly>{{ t("office.ownerOnly") }}</p>
    <div
      v-if="notice"
      ref="notice"
      tabindex="-1"
      role="status"
      class="rounded-md focus:outline-none"
    >
      <UAlert color="success" variant="subtle" :description="notice" />
    </div>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />
    <UForm
      :schema="schema"
      :state="state"
      :disabled="!canEdit"
      class="space-y-5"
      @submit="onSubmit"
    >
      <UFormField :label="t('office.profile.name')" name="name" required>
        <UInput
          v-model="state.name"
          name="name"
          autocomplete="organization"
          class="w-full"
          :disabled="!canEdit"
        />
      </UFormField>
      <UFormField
        :label="t('office.profile.cnpj')"
        name="cnpj"
        :help="t('office.profile.cnpjHelp')"
      >
        <UInput
          :model-value="state.cnpj"
          name="cnpj"
          autocomplete="off"
          spellcheck="false"
          :maxlength="18"
          class="w-full max-w-xs tabular-nums"
          :disabled="!canEdit"
          @update:model-value="state.cnpj = formatCnpj(String($event))"
        />
      </UFormField>
      <div class="grid gap-5 sm:grid-cols-2">
        <UFormField :label="t('office.profile.email')" name="contactEmail">
          <UInput
            v-model="state.contactEmail"
            name="contactEmail"
            type="email"
            autocomplete="email"
            class="w-full"
            :disabled="!canEdit"
          />
        </UFormField>
        <UFormField :label="t('office.profile.phone')" name="contactPhone">
          <UInput
            v-model="state.contactPhone"
            name="contactPhone"
            type="tel"
            autocomplete="tel"
            class="w-full"
            :disabled="!canEdit"
          />
        </UFormField>
      </div>
      <UButton v-if="canEdit" type="submit" size="lg" :loading="saving">
        {{ t("office.profile.save") }}
      </UButton>
    </UForm>
  </div>
</template>
