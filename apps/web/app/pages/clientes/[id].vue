<script setup lang="ts">
// Edit a client: names and notes; the registry fields come from the lookup. Delete is audited.
definePageMeta({ middleware: "auth", layout: "app" })
const { t } = useI18n()
const route = useRoute()
const id = String(route.params.id)
const { get } = useClients()
const notice = useClientsNotice()

const { data: client, error } = await useAsyncData(`client:${id}`, () => get(id))
useHead({ title: () => client.value?.legalName ?? t("clients.edit.title") })

const created = route.query.criado === "1"
const deleting = ref(false)

async function onDeleted() {
  notice.value = t("clients.delete.done", { name: client.value?.legalName ?? "" })
  await navigateTo("/clientes")
}
</script>

<template>
  <section class="surface-glass motion-enter max-w-3xl p-6 sm:p-8">
    <template v-if="client">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-primary">{{ t("clients.edit.title") }}</p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight break-words text-highlighted">
            {{ client.legalName }}
          </h1>
        </div>
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" @click="deleting = true">
          {{ t("clients.actions.delete") }}
        </UButton>
      </div>
      <UAlert
        v-if="created"
        role="status"
        color="success"
        variant="subtle"
        class="mt-4"
        :description="t('clients.new.done')"
      />
      <p v-if="client.lookup" class="mt-2 text-sm text-muted">
        {{ t("clients.lookup.filled", { at: formatFetchedAt(client.lookup.fetchedAt) }) }}
        · {{ t("clients.fields.regime") }}: {{ t(regimeKey(client.taxRegime)) }}
      </p>
      <div class="mt-6">
        <ClientsClientForm :client="client" @saved="client = $event" />
      </div>
      <ClientsDeleteDialog v-model:open="deleting" :client="client" @deleted="onDeleted" />
    </template>
    <template v-else>
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
        {{ t("clients.edit.title") }}
      </h1>
      <UAlert
        role="alert"
        color="error"
        variant="subtle"
        class="mt-4"
        :description="t(clientErrorKey(error, 'load'))"
      />
      <UButton to="/clientes" color="neutral" variant="ghost" class="mt-4">
        {{ t("clients.form.back") }}
      </UButton>
    </template>
  </section>
</template>
