<script setup lang="ts">
import type { Client } from "~/utils/clients"

// New client (FE-02.2): CNPJ autofill from the registry, manual entry when it is unavailable.
definePageMeta({ middleware: "auth", layout: "app" })
const { t } = useI18n()
useHead({ title: t("clients.new.title") })

async function onCreated(client: Client) {
  await navigateTo({ path: `/clientes/${client.id}`, query: { criado: "1" } })
}
</script>

<template>
  <section class="surface-glass motion-enter max-w-3xl p-6 sm:p-8">
    <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
      {{ t("clients.new.title") }}
    </h1>
    <p class="mt-1 mb-6 text-muted">{{ t("clients.new.description") }}</p>
    <ClientsClientForm @created="onCreated" />
  </section>
</template>
