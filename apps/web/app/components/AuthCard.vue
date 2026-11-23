<script setup lang="ts">
// Glass card centred on the page gradient, shared by the auth screens.
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <UContainer class="flex justify-center py-10 sm:py-16">
    <section class="surface-glass w-full max-w-md p-6 sm:p-8">
      <AppWordmark />
      <h1 class="mt-6 text-2xl font-semibold tracking-tight text-highlighted">{{ title }}</h1>
      <p v-if="description" class="mt-2 text-muted">{{ description }}</p>
      <div class="mt-6 space-y-4">
        <slot />
      </div>
      <div v-if="$slots.footer" class="mt-6 border-t border-default pt-4 text-sm text-muted">
        <slot name="footer" />
      </div>
    </section>
  </UContainer>
</template>
