import type { Client, ClientPage, CnpjRecord } from "~/utils/clients"

/** Notice shown on the list after a delete (kept in state, never in the URL: names are fiscal data). */
export const useClientsNotice = () => useState<string | null>("clients:notice", () => null)

/** `/v1/clients` and `/v1/cnpj` of the API, with the session cookie (see `useAuth`). */
export function useClients() {
  const { apiUrl } = useRuntimeConfig().public
  const api = $fetch.create({
    baseURL: apiUrl,
    credentials: "include",
    retry: 0,
    headers: import.meta.server ? useRequestHeaders(["cookie"]) : {},
  })
  return {
    list: (query: { q?: string; page: number; pageSize: number }) =>
      api<ClientPage>("/v1/clients", { query }),
    get: (id: string) => api<Client>(`/v1/clients/${encodeURIComponent(id)}`),
    lookup: (cnpj: string) => api<CnpjRecord>(`/v1/cnpj/${encodeURIComponent(cnpj)}`),
    create: (body: {
      cnpj: string
      legalName?: string
      tradeName?: string
      notes?: string
      lookup: boolean
    }) => api<Client>("/v1/clients", { method: "POST", body }),
    update: (
      id: string,
      body: { legalName: string; tradeName: string | null; notes: string | null },
    ) => api<Client>(`/v1/clients/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    remove: (id: string) =>
      api<null>(`/v1/clients/${encodeURIComponent(id)}`, { method: "DELETE" }),
  }
}
