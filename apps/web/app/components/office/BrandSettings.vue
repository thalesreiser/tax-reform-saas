<script setup lang="ts">
import type { OfficeSettings } from "~/utils/office"

// Brand colour and logo used on reports and the share view (RF-08). Low contrast warns, never
// blocks. The logo is checked here (type, size, dimensions) before the upload; the API checks the
// bytes again and its errors are shown as they come.
const props = defineProps<{ settings: OfficeSettings }>()
const emit = defineEmits<{ saved: [settings: OfficeSettings] }>()
const { t } = useI18n()
const api = useOfficeSettings()
const canEdit = computed(() => props.settings.role === "owner")

const DEFAULT_COLOR = "#6D4AFF"
const hexInput = ref(props.settings.brandColor ?? "")
const hex = computed(() => normalizeHex(hexInput.value))
const shown = computed(() => hex.value ?? props.settings.brandColor ?? DEFAULT_COLOR)
const contrast = computed(() =>
  hex.value === props.settings.brandColor && props.settings.brandContrast
    ? props.settings.brandContrast
    : brandContrast(shown.value),
)
const hexError = computed(() =>
  hexInput.value.trim() !== "" && hex.value === null ? t("office.brand.hexInvalid") : undefined,
)

const status = ref("")
const error = ref<string | null>(null)
const busy = ref<"color" | "logo" | null>(null)

async function saveColor(value: string | null) {
  busy.value = "color"
  error.value = null
  status.value = ""
  try {
    const saved = await api.update({ brandColor: value })
    hexInput.value = saved.brandColor ?? ""
    emit("saved", saved)
    status.value = t(value === null ? "office.brand.colorCleared" : "office.brand.colorSaved")
  } catch (e) {
    error.value = t(officeErrorKey(e, "save"))
  } finally {
    busy.value = null
  }
}

const fileInput = useTemplateRef<HTMLInputElement>("file")

async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file) return
  error.value = null
  status.value = ""
  const problem = logoFileProblem(file)
  if (problem) {
    error.value = t(problem)
    return
  }
  const size = await imageSize(file)
  const sizeProblem = size ? logoDimensionProblem(size) : "office.brand.logoErrors.unreadable"
  if (sizeProblem) {
    error.value = t(sizeProblem)
    return
  }
  busy.value = "logo"
  status.value = t("office.brand.uploading")
  try {
    const saved = await api.uploadLogo(file)
    emit("saved", saved)
    status.value = t("office.brand.logoSaved")
  } catch (e) {
    status.value = ""
    error.value = t(officeErrorKey(e, "logo"))
  } finally {
    busy.value = null
  }
}

async function removeLogo() {
  busy.value = "logo"
  error.value = null
  status.value = ""
  try {
    await api.removeLogo()
    emit("saved", { ...props.settings, logo: null })
    status.value = t("office.brand.logoRemoved")
  } catch (e) {
    error.value = t(officeErrorKey(e, "removeLogo"))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="!canEdit" class="text-sm text-muted">{{ t("office.ownerOnly") }}</p>
    <p aria-live="polite" class="min-h-5 text-sm text-muted" data-brand-status>{{ status }}</p>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="space-y-4">
        <h3 class="font-semibold text-highlighted">{{ t("office.brand.colorTitle") }}</h3>
        <div v-if="canEdit" class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm font-medium text-default">
            {{ t("office.brand.picker") }}
            <input
              type="color"
              :value="shown.toLowerCase()"
              class="h-10 w-14 cursor-pointer rounded-md border border-default bg-default"
              @input="hexInput = ($event.target as HTMLInputElement).value.toUpperCase()"
            />
          </label>
          <UFormField :label="t('office.brand.hex')" name="brandColor" :error="hexError">
            <UInput
              v-model="hexInput"
              name="brandColor"
              placeholder="#6D4AFF"
              :maxlength="7"
              spellcheck="false"
              class="w-32 font-medium tabular-nums"
            />
          </UFormField>
        </div>
        <p v-else class="text-sm text-default">
          {{ settings.brandColor ?? t("office.brand.noColor") }}
        </p>
        <p
          class="text-sm"
          :class="contrast.meetsAaOnWhite ? 'text-muted' : 'text-warning'"
          data-contrast
        >
          {{
            t(contrast.meetsAaOnWhite ? "office.brand.contrastOk" : "office.brand.contrastLow", {
              ratio: formatRatio(contrast.onWhite),
            })
          }}
        </p>
        <div v-if="canEdit" class="flex flex-wrap gap-2">
          <UButton
            :disabled="hex === null || hex === settings.brandColor"
            :loading="busy === 'color'"
            @click="saveColor(hex)"
          >
            {{ t("office.brand.saveColor") }}
          </UButton>
          <UButton
            v-if="settings.brandColor"
            color="neutral"
            variant="ghost"
            :disabled="busy !== null"
            @click="saveColor(null)"
          >
            {{ t("office.brand.clearColor") }}
          </UButton>
        </div>
      </div>

      <figure class="space-y-2">
        <figcaption class="text-sm font-medium text-muted">
          {{ t("office.brand.preview") }}
        </figcaption>
        <!-- Sample report header: fixed white paper, as printed reports are. -->
        <div class="overflow-hidden rounded-xl border border-default bg-white text-[#1c1b3a]">
          <div class="h-2" :style="{ backgroundColor: shown }" />
          <div class="flex items-center gap-3 p-4">
            <img
              v-if="settings.logo"
              :src="api.logoSrc(settings.logo)"
              alt=""
              class="h-10 w-auto max-w-24 object-contain"
            />
            <div class="min-w-0">
              <p class="truncate font-semibold" :style="{ color: shown }">{{ settings.name }}</p>
              <p class="text-sm">{{ t("office.brand.sampleReport") }}</p>
            </div>
          </div>
          <div class="px-4 pb-4">
            <span
              class="inline-block rounded-md px-3 py-1.5 text-sm font-medium text-white"
              :style="{ backgroundColor: shown }"
            >
              {{ t("office.brand.sampleButton") }}
            </span>
          </div>
        </div>
      </figure>
    </div>

    <div class="space-y-3">
      <h3 class="font-semibold text-highlighted">{{ t("office.brand.logoTitle") }}</h3>
      <div class="flex flex-wrap items-center gap-4">
        <img
          v-if="settings.logo"
          :src="api.logoSrc(settings.logo)"
          :alt="t('office.brand.logoAlt', { name: settings.name })"
          class="h-16 w-auto max-w-40 rounded-md border border-default bg-white object-contain p-1"
        />
        <p v-else class="text-sm text-muted">{{ t("office.brand.noLogo") }}</p>
        <template v-if="canEdit">
          <input
            ref="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="sr-only"
            name="logo"
            :aria-label="t('office.brand.chooseLogo')"
            @change="onFile"
          />
          <UButton
            icon="i-lucide-upload"
            variant="outline"
            :loading="busy === 'logo'"
            @click="fileInput?.click()"
          >
            {{ settings.logo ? t("office.brand.replaceLogo") : t("office.brand.chooseLogo") }}
          </UButton>
          <UButton
            v-if="settings.logo"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="busy !== null"
            data-action="remove-logo"
            @click="removeLogo"
          >
            {{ t("office.brand.removeLogo") }}
          </UButton>
        </template>
      </div>
      <p v-if="canEdit" class="text-sm text-muted">{{ t("office.brand.logoHelp") }}</p>
    </div>
  </div>
</template>
