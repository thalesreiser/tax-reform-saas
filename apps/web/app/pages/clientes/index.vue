<script setup lang="ts">
import type { Client } from "~/utils/clients"

// Client list (FE-02.2): search by name or CNPJ prefix (debounced, kept in `?q=`), pages in
// `?pagina=`; a table from `md`, cards on phones.
definePageMeta({ middleware: "auth", layout: "app" })
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { list } = useClients()
useHead({ title: t("clients.list.title") })

const q = computed(() => (typeof route.query.q === "string" ? route.query.q.trim() : ""))
const page = computed(() =>
  Math.max(1, Number.parseInt(String(route.query.pagina ?? "1"), 10) || 1),
)

const { data, status, error, refresh } = await useAsyncData(
  "clients:list",
  () => list({ ...(q.value ? { q: q.value } : {}), page: page.value, pageSize: CLIENTS_PAGE_SIZE }),
  { watch: [q, page] },
)

const search = ref(q.value)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const term = value.trim()
    void router.replace({ query: term ? { q: term } : {} })
  }, 300)
})

function goTo(next: number) {
  void router.push({ query: { ...route.query, pagina: next > 1 ? String(next) : undefined } })
}

const notice = useClientsNotice()
const noticeEl = useTemplateRef<HTMLElement>("notice")
const deleting = ref(false)
const target = ref<Client | null>(null)

function askDelete(client: Client) {
  target.value = client
  deleting.value = true
}

async function focusNotice() {
  await nextTick()
  noticeEl.value?.focus()
}

async function onDeleted(client: Pick<Client, "legalName">) {
  notice.value = t("clients.delete.done", { name: client.legalName })
  await refresh()
  await focusNotice()
}

onMounted(() => {
  if (notice.value) void focusNotice()
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  notice.value = null
})

const items = computed(() => data.value?.items ?? [])
const retry = computed(() => [
  {
    label: t("clients.list.retry"),
    color: "error" as const,
    variant: "outline" as const,
    onClick: () => void refresh(),
  },
])
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
          {{ t("clients.list.title") }}
        </h1>
        <p class="mt-1 text-muted">{{ t("clients.list.description") }}</p>
      </div>
      <UButton to="/clientes/novo" icon="i-lucide-plus" size="lg">
        {{ t("clients.list.create") }}
      </UButton>
    </div>

    <div v-if="notice" ref="notice" tabindex="-1" role="status" class="focus:outline-none">
      <UAlert color="success" variant="subtle" :description="notice" />
    </div>

    <section aria-labelledby="clients-title" class="surface-glass motion-enter p-4 sm:p-6">
      <h2 id="clients-title" class="sr-only">{{ t("clients.list.title") }}</h2>
      <UFormField :label="t('clients.list.search')" name="q" class="max-w-md">
        <UInput
          v-model="search"
          name="q"
          type="search"
          icon="i-lucide-search"
          :placeholder="t('clients.list.searchPlaceholder')"
          class="w-full"
        />
      </UFormField>

      <p aria-live="polite" class="sr-only">
        <template v-if="status === 'pending'">{{ t("clients.list.loading") }}</template>
        <template v-else-if="data">
          {{ t("clients.list.count", { n: data.total }, data.total) }}
        </template>
      </p>

      <UAlert
        v-if="error"
        role="alert"
        color="error"
        variant="subtle"
        class="mt-6"
        :description="t(clientErrorKey(error, 'load'))"
        :actions="retry"
      />
      <p v-else-if="status === 'pending' && !data" class="mt-6 text-muted">
        {{ t("clients.list.loading") }}
      </p>
      <div
        v-else-if="items.length === 0"
        class="mt-6 rounded-2xl border border-default p-6 text-center"
        data-empty
      >
        <p v-if="q" class="font-medium text-highlighted">
          {{ t("clients.list.noResults", { q }) }}
        </p>
        <template v-else>
          <p class="font-medium text-highlighted">{{ t("clients.list.empty") }}</p>
          <p class="mt-1 text-muted">{{ t("clients.list.emptyHint") }}</p>
          <UButton to="/clientes/novo" class="mt-4">{{ t("clients.list.create") }}</UButton>
        </template>
      </div>

      <template v-else>
        <div class="mt-6 hidden md:block">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              {{
                t("clients.list.caption")
              }}
            </caption>
            <thead class="text-muted">
              <tr class="border-b border-default">
                <th scope="col" class="py-2 pr-4 font-medium">{{ t("clients.fields.name") }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ t("clients.fields.cnpj") }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ t("clients.fields.status") }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ t("clients.fields.regime") }}</th>
                <th scope="col" class="py-2 text-right font-medium">
                  {{ t("clients.list.actions") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in items" :key="c.id" class="border-b border-default">
                <th scope="row" class="py-3 pr-4 font-medium">
                  <NuxtLink :to="`/clientes/${c.id}`" class="text-highlighted hover:underline">
                    {{ c.legalName }}
                  </NuxtLink>
                  <span v-if="c.tradeName" class="block font-normal text-muted">
                    {{ c.tradeName }}
                  </span>
                </th>
                <td class="py-3 pr-4 whitespace-nowrap tabular-nums">{{ formatCnpj(c.cnpj) }}</td>
                <td class="py-3 pr-4">{{ c.registrationStatus ?? t("clients.notInformed") }}</td>
                <td class="py-3 pr-4">{{ t(regimeKey(c.taxRegime)) }}</td>
                <td class="py-3 text-right whitespace-nowrap">
                  <UButton
                    :to="`/clientes/${c.id}`"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-pencil"
                    :aria-label="t('clients.actions.editNamed', { name: c.legalName })"
                  />
                  <UButton
                    color="error"
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-trash-2"
                    :aria-label="t('clients.actions.deleteNamed', { name: c.legalName })"
                    @click="askDelete(c)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul class="mt-6 space-y-3 md:hidden">
          <li v-for="c in items" :key="c.id" class="rounded-2xl border border-default p-4">
            <NuxtLink
              :to="`/clientes/${c.id}`"
              class="font-medium text-highlighted hover:underline"
            >
              {{ c.legalName }}
            </NuxtLink>
            <p v-if="c.tradeName" class="text-sm text-muted">{{ c.tradeName }}</p>
            <p class="mt-2 text-sm tabular-nums">{{ formatCnpj(c.cnpj) }}</p>
            <p class="text-sm">
              {{ c.registrationStatus ?? t("clients.notInformed") }} ·
              {{ t(regimeKey(c.taxRegime)) }}
            </p>
            <div class="mt-3 flex gap-2">
              <UButton :to="`/clientes/${c.id}`" color="neutral" variant="outline" size="sm">
                {{ t("clients.actions.edit") }}
              </UButton>
              <UButton color="error" variant="ghost" size="sm" @click="askDelete(c)">
                {{ t("clients.actions.delete") }}
              </UButton>
            </div>
          </li>
        </ul>

        <UPagination
          v-if="data && data.total > CLIENTS_PAGE_SIZE"
          class="mt-6"
          :page="page"
          :total="data.total"
          :items-per-page="CLIENTS_PAGE_SIZE"
          @update:page="goTo"
        />
      </template>
    </section>

    <ClientsDeleteDialog v-model:open="deleting" :client="target" @deleted="onDeleted" />
  </div>
</template>
