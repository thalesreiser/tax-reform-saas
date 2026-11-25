<script setup lang="ts">
// Office settings (FE-02.4): profile, brand, team and the API keys placeholder (BE-03.1).
definePageMeta({ middleware: "auth", layout: "app" })
const { t } = useI18n()
useHead({ title: t("office.title") })
const api = useOfficeSettings()
const { session } = useAuth()

const { data, error } = await useAsyncData("office-settings", async () => {
  const settings = await api.get()
  const owner = settings.role === "owner"
  const [members, invitations] = await Promise.all([
    api.members(),
    owner ? api.invitations() : Promise.resolve({ items: [] }),
  ])
  return { settings, members: members.items, invitations: invitations.items }
})

const office = useOffice()
function onSaved(settings: NonNullable<typeof data.value>["settings"]) {
  if (!data.value) return
  data.value = { ...data.value, settings }
  // The header shows the office name from `GET /office`.
  if (office.data.value) office.data.value = { ...office.data.value, name: settings.name }
}

const sections = ["perfil", "marca", "equipe", "chaves"] as const
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
        {{ t("office.title") }}
      </h1>
      <p class="mt-1 text-muted">{{ t("office.description") }}</p>
    </div>

    <UAlert
      v-if="!data"
      role="alert"
      color="error"
      variant="subtle"
      :description="t(officeErrorKey(error, 'load'))"
    />
    <template v-else>
      <nav :aria-label="t('office.sectionsLabel')" class="-mx-1 overflow-x-auto">
        <ul class="flex gap-2 px-1 pb-1">
          <li v-for="id in sections" :key="id" class="shrink-0">
            <UButton :to="`#${id}`" color="neutral" variant="outline" size="sm">
              {{ t(`office.sections.${id}`) }}
            </UButton>
          </li>
        </ul>
      </nav>

      <section
        id="perfil"
        aria-labelledby="perfil-title"
        class="surface-glass motion-enter scroll-mt-24 p-6 sm:p-8"
      >
        <h2 id="perfil-title" class="mb-4 text-xl font-semibold text-highlighted">
          {{ t("office.sections.perfil") }}
        </h2>
        <OfficeProfileForm :settings="data.settings" @saved="onSaved" />
      </section>

      <section
        id="marca"
        aria-labelledby="marca-title"
        class="surface-glass motion-enter scroll-mt-24 p-6 sm:p-8"
      >
        <h2 id="marca-title" class="mb-4 text-xl font-semibold text-highlighted">
          {{ t("office.sections.marca") }}
        </h2>
        <OfficeBrandSettings :settings="data.settings" @saved="onSaved" />
      </section>

      <section
        id="equipe"
        aria-labelledby="equipe-title"
        class="surface-glass motion-enter scroll-mt-24 p-6 sm:p-8"
      >
        <h2 id="equipe-title" class="mb-4 text-xl font-semibold text-highlighted">
          {{ t("office.sections.equipe") }}
        </h2>
        <OfficeTeamSection
          :office-id="data.settings.id"
          :can-manage="data.settings.role === 'owner'"
          :current-user-id="session?.user.id ?? null"
          :initial-members="data.members"
          :initial-invitations="data.invitations"
        />
      </section>

      <section
        id="chaves"
        aria-labelledby="chaves-title"
        class="surface-glass motion-enter scroll-mt-24 p-6 sm:p-8"
      >
        <div class="flex flex-wrap items-center gap-3">
          <h2 id="chaves-title" class="text-xl font-semibold text-highlighted">
            {{ t("office.sections.chaves") }}
          </h2>
          <UBadge color="neutral" variant="subtle">{{ t("appShell.soon") }}</UBadge>
        </div>
        <p class="mt-2 text-muted">{{ t("office.apiKeysSoon") }}</p>
      </section>
    </template>
  </div>
</template>
