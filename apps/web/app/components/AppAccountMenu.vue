<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"

// Header actions of a signed-in user: office name and an account menu with sign-out.
const { t } = useI18n()
const { session, signOut } = useAuth()
const { data: office } = await useOffice()

async function leave() {
  await signOut()
  await navigateTo("/entrar")
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", label: session.value?.user.email ?? "" }],
  [{ label: t("auth.signOut"), icon: "i-lucide-log-out", onSelect: () => void leave() }],
])
</script>

<template>
  <span v-if="office" class="hidden max-w-48 truncate text-sm text-muted md:inline">
    {{ office.name }}
  </span>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-circle-user"
      trailing-icon="i-lucide-chevron-down"
      :label="session?.user.name"
      :ui="{ label: 'max-w-32 truncate max-sm:sr-only' }"
    />
  </UDropdownMenu>
</template>
