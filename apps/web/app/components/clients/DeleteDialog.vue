<script setup lang="ts">
import type { Client } from "~/utils/clients"

// In-page delete confirmation (no `confirm()`). The modal traps focus and returns it to the
// trigger on cancel; after a delete the parent moves focus to its notice.
const props = defineProps<{ client: Pick<Client, "id" | "legalName"> | null }>()
const emit = defineEmits<{ deleted: [client: Pick<Client, "id" | "legalName">] }>()
const open = defineModel<boolean>("open", { default: false })
const { t } = useI18n()
const { remove } = useClients()
const loading = ref(false)
const error = ref<string | null>(null)

watch(open, (value) => {
  if (value) error.value = null
})

async function confirmDelete() {
  const client = props.client
  if (!client) return
  loading.value = true
  error.value = null
  try {
    await remove(client.id)
    open.value = false
    emit("deleted", client)
  } catch (e) {
    error.value = t(clientErrorKey(e, "delete"))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('clients.delete.title')">
    <template #body>
      <p class="text-default">
        {{ t("clients.delete.confirm", { name: client?.legalName ?? "" }) }}
      </p>
      <p class="mt-2 text-sm text-muted">{{ t("clients.delete.audit") }}</p>
      <UAlert
        v-if="error"
        role="alert"
        color="error"
        variant="subtle"
        class="mt-4"
        :description="error"
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          {{ t("clients.delete.cancel") }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          data-action="confirm-delete"
          @click="confirmDelete"
        >
          {{ t("clients.delete.submit") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
