<script setup lang="ts">
// Password input with a show/hide toggle. `autocomplete` is passed through so password managers
// keep working whichever type is shown.
defineProps<{ autocomplete: "current-password" | "new-password" }>()
const model = defineModel<string>({ required: true })
const { t } = useI18n()
const visible = ref(false)
</script>

<template>
  <UInput
    v-model="model"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    :ui="{ trailing: 'pe-1' }"
    class="w-full"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="t('auth.fields.showPassword')"
        :aria-pressed="visible"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
