<script setup lang="ts">
// Nuxt UI's own labels (colour mode button, menus) in Brazilian Portuguese.
import { pt_br } from "@nuxt/ui/locale"
</script>

<template>
  <UApp :locale="pt_br">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
