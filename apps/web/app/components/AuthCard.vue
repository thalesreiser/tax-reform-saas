<script setup lang="ts">
// Auth screens: the glass form card and, beside it on large screens, the brand panel. On phones the
// form comes first and the brand panel shrinks to a short strip below it. The header carries the
// wordmark, so the card does not repeat it.
defineProps<{ title: string; description?: string }>()
const titleId = useId()
</script>

<template>
  <UContainer class="py-8 sm:py-12 lg:py-16">
    <div class="mx-auto grid max-w-md gap-6 lg:max-w-none lg:grid-cols-2 lg:gap-10">
      <section
        :aria-labelledby="titleId"
        class="surface-glass motion-enter p-6 sm:p-8 lg:order-2 lg:self-center lg:p-10"
      >
        <h1 :id="titleId" class="text-2xl font-semibold tracking-tight text-highlighted">
          {{ title }}
        </h1>
        <p v-if="description" class="mt-2 text-muted">{{ description }}</p>
        <div class="mt-6 space-y-4">
          <slot />
        </div>
        <div v-if="$slots.footer" class="mt-6 border-t border-default pt-4 text-sm text-muted">
          <slot name="footer" />
        </div>
      </section>
      <AuthBrandPanel class="lg:order-1" />
    </div>
  </UContainer>
</template>
