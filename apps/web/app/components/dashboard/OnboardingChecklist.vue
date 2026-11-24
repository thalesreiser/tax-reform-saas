<script setup lang="ts">
import type { OnboardingStep } from "~/utils/dashboard"
import { nextStep } from "~/utils/dashboard"

// First steps of a new office (FE-02.1 acceptance). The next pending step sits on the brand panel;
// steps whose page does not exist yet show "Em breve" instead of a link.
const props = defineProps<{ steps: OnboardingStep[] }>()
const { t } = useI18n()
const next = computed(() => nextStep(props.steps))
const done = computed(() => props.steps.filter((s) => s.done).length)
</script>

<template>
  <section aria-labelledby="onboarding-title" class="surface-glass motion-enter p-6 sm:p-8">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="onboarding-title" class="text-xl font-semibold tracking-tight text-highlighted">
        {{ t("dashboard.onboarding.title") }}
      </h2>
      <p class="text-sm text-muted tabular-nums">
        {{ t("dashboard.onboarding.progress", { done, total: steps.length }) }}
      </p>
    </div>
    <p class="mt-1 text-muted">{{ t("dashboard.onboarding.description") }}</p>

    <ol class="mt-6 grid gap-3 md:grid-cols-2">
      <li
        v-for="(step, i) in steps"
        :key="step.id"
        class="flex gap-4 rounded-2xl p-4"
        :class="step.id === next?.id ? 'surface-brand' : 'border border-default'"
        :aria-current="step.id === next?.id ? 'step' : undefined"
      >
        <span
          aria-hidden="true"
          class="grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums"
          :class="
            step.done
              ? 'bg-success text-inverted'
              : step.id === next?.id
                ? 'border-2 border-white'
                : 'border-2 border-default text-muted'
          "
        >
          <UIcon v-if="step.done" name="i-lucide-check" class="size-4" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2">
            <span class="font-semibold" :class="{ 'text-highlighted': step.id !== next?.id }">
              {{ t(`dashboard.onboarding.steps.${step.id}.title`) }}
            </span>
            <span class="sr-only">
              ({{ t(step.done ? "dashboard.onboarding.done" : "dashboard.onboarding.pending") }})
            </span>
            <span
              v-if="step.id === next?.id"
              class="rounded-full border border-white/70 px-2 text-xs font-medium"
            >
              {{ t("dashboard.onboarding.next") }}
            </span>
          </p>
          <p class="mt-1 text-sm" :class="{ 'text-muted': step.id !== next?.id }">
            {{ t(`dashboard.onboarding.steps.${step.id}.description`) }}
          </p>
          <div v-if="!step.done" class="mt-3">
            <UButton
              v-if="step.to"
              :to="step.to"
              :color="step.id === next?.id ? 'neutral' : 'primary'"
              :variant="step.id === next?.id ? 'solid' : 'outline'"
              size="sm"
            >
              {{ t(`dashboard.onboarding.steps.${step.id}.action`) }}
            </UButton>
            <span
              v-else
              aria-disabled="true"
              class="inline-flex items-center gap-1.5 text-sm font-medium"
              :class="{ 'text-muted': step.id !== next?.id }"
            >
              <UIcon name="i-lucide-clock" class="size-4" aria-hidden="true" />
              {{ t(`dashboard.onboarding.steps.${step.id}.action`) }} ·
              {{ t("appShell.soon") }}
            </span>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>
