<script setup lang="ts">
import { NAV_ITEMS } from "~/utils/dashboard"

// Signed-in navigation (sidebar on large screens, drawer on phones). Pages that do not exist yet
// are shown disabled with "Em breve", never as broken links.
defineEmits<{ navigate: [] }>()
const { t } = useI18n()
</script>

<template>
  <nav :aria-label="t('appShell.navLabel')">
    <ul class="space-y-1">
      <li v-for="item in NAV_ITEMS" :key="item.id">
        <NuxtLink
          v-if="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-md border-l-4 border-transparent px-3 py-2 font-medium text-default hover:bg-elevated aria-[current=page]:border-primary aria-[current=page]:bg-primary/10 aria-[current=page]:text-highlighted"
          @click="$emit('navigate')"
        >
          <UIcon :name="item.icon" class="size-5 shrink-0" />
          {{ t(`appShell.nav.${item.id}`) }}
        </NuxtLink>
        <a
          v-else
          role="link"
          aria-disabled="true"
          class="flex cursor-not-allowed items-center gap-3 border-l-4 border-transparent px-3 py-2 text-muted"
        >
          <UIcon :name="item.icon" class="size-5 shrink-0" />
          <span class="flex-1">{{ t(`appShell.nav.${item.id}`) }}</span>
          <UBadge color="neutral" variant="subtle" size="sm">{{ t("appShell.soon") }}</UBadge>
        </a>
      </li>
    </ul>
  </nav>
</template>
