<script setup lang="ts">
import type { Member } from "~/utils/office"

// In-page confirmation to remove a member (the modal traps focus). A 409 means the member is the
// last owner and stays, with the reason shown in the dialog.
const props = defineProps<{ member: Member | null }>()
const emit = defineEmits<{ removed: [member: Member] }>()
const open = defineModel<boolean>("open", { default: false })
const { t } = useI18n()
const { removeMember } = useOfficeSettings()
const loading = ref(false)
const error = ref<string | null>(null)

watch(open, (value) => {
  if (value) error.value = null
})

async function confirmRemove() {
  const member = props.member
  if (!member) return
  loading.value = true
  error.value = null
  try {
    await removeMember(member.id)
    open.value = false
    emit("removed", member)
  } catch (e) {
    error.value = t(officeErrorKey(e, "remove"))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('office.team.remove.title')">
    <template #body>
      <p class="text-default">
        {{ t("office.team.remove.confirm", { name: member?.name ?? "" }) }}
      </p>
      <p class="mt-2 text-sm text-muted">{{ t("office.team.remove.effect") }}</p>
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
          {{ t("office.team.remove.cancel") }}
        </UButton>
        <UButton
          color="error"
          :loading="loading"
          data-action="confirm-remove"
          @click="confirmRemove"
        >
          {{ t("office.team.remove.submit") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
