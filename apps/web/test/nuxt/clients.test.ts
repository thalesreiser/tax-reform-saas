// Client form and delete dialog in the Nuxt runtime, with the API composable mocked.
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime"
import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ClientForm from "../../app/components/clients/ClientForm.vue"
import DeleteDialog from "../../app/components/clients/DeleteDialog.vue"
import type { Client, CnpjRecord } from "../../app/utils/clients"

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  lookup: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))
mockNuxtImport("useClients", () => () => api)

// Fictional company; 11222333000181 is a generated test CNPJ.
const RECORD: CnpjRecord = {
  cnpj: "11222333000181",
  legalName: "EMPRESA FICTICIA DE TESTES LTDA",
  tradeName: "LOJA EXEMPLO",
  address: { city: "CIDADE EXEMPLO", state: "SP" },
  mainCnae: null,
  registrationStatus: "ATIVA",
  taxRegime: "simples_nacional",
  source: "brasilapi",
  fetchedAt: "2026-11-24T17:05:00.000Z",
}
const CLIENT: Client = {
  id: "7d1f0c2a-1111-4222-8333-444455556666",
  cnpj: RECORD.cnpj,
  legalName: RECORD.legalName,
  tradeName: RECORD.tradeName,
  registrationStatus: "ATIVA",
  taxRegime: "simples_nacional",
  lookup: { source: "brasilapi", fetchedAt: RECORD.fetchedAt },
  notes: null,
}
const fail = (status: number) => Object.assign(new Error("failed"), { response: { status } })

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
  }
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
})
afterEach(() => {
  document.body.innerHTML = ""
})

const input = (w: { find: (selector: string) => { element: Element } }, name: string) =>
  w.find(`[name="${name}"]`).element as HTMLInputElement

describe("client form", () => {
  it("masks the CNPJ, flags wrong digits and does not look them up", async () => {
    const w = await mountSuspended(ClientForm)
    await w.find('input[name="cnpj"]').setValue("11222333000182")
    await settle()
    expect(input(w, "cnpj").value).toBe("11.222.333/0001-82")
    expect(w.text()).toContain("CNPJ inválido")
    expect(api.lookup).not.toHaveBeenCalled()
  })

  it("fills the fields from the registry when a valid CNPJ is typed, then creates with lookup", async () => {
    api.lookup.mockResolvedValue(RECORD)
    api.create.mockResolvedValue(CLIENT)
    const w = await mountSuspended(ClientForm)
    await w.find('input[name="cnpj"]').setValue("11222333000181")
    await settle()
    expect(api.lookup).toHaveBeenCalledWith("11222333000181")
    expect(input(w, "legalName").value).toBe("EMPRESA FICTICIA DE TESTES LTDA")
    expect(input(w, "tradeName").value).toBe("LOJA EXEMPLO")
    const status = w.find("[aria-live=polite]")
    expect(status.text()).toBe("Dados preenchidos pela Receita via BrasilAPI em 24/11/2026, 14:05.")
    expect(w.text()).toContain("Simples Nacional")
    expect(w.text()).toContain("ATIVA")

    await w.find("form").trigger("submit")
    await settle()
    expect(api.create).toHaveBeenCalledWith({
      cnpj: "11222333000181",
      legalName: "EMPRESA FICTICIA DE TESTES LTDA",
      tradeName: "LOJA EXEMPLO",
      notes: undefined,
      lookup: true,
    })
    expect(w.emitted("created")?.[0]).toEqual([CLIENT])
  })

  it.each([
    [404, "não encontrado no cadastro da Receita"],
    [502, "indisponível no momento"],
    [504, "indisponível no momento"],
    [429, "Aguarde um minuto"],
  ])("explains a %i lookup and lets the user fill in by hand", async (status, message) => {
    api.lookup.mockRejectedValue(fail(status))
    api.create.mockResolvedValue(CLIENT)
    const w = await mountSuspended(ClientForm)
    await w.find('input[name="cnpj"]').setValue("12abc34501de35")
    await settle()
    expect(w.find("[aria-live=polite]").text()).toContain(message)
    await w.find('input[name="legalName"]').setValue("Empresa Manual Fictícia")
    await w.find("form").trigger("submit")
    await settle()
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cnpj: "12ABC34501DE35",
        legalName: "Empresa Manual Fictícia",
        lookup: false,
      }),
    )
  })

  it("links to the existing client on a duplicate CNPJ (409)", async () => {
    api.lookup.mockRejectedValue(fail(404))
    api.create.mockRejectedValue(fail(409))
    api.list.mockResolvedValue({ items: [CLIENT], page: 1, pageSize: 1, total: 1 })
    const w = await mountSuspended(ClientForm)
    await w.find('input[name="cnpj"]').setValue("11222333000181")
    await w.find('input[name="legalName"]').setValue("Outra Empresa")
    await w.find("form").trigger("submit")
    await settle()
    expect(w.find("[role=alert]").text()).toContain("já está cadastrado")
    expect(w.find(`a[href="/clientes/${CLIENT.id}"]`).exists()).toBe(true)
  })

  it("edits names and notes and announces the save", async () => {
    api.update.mockResolvedValue({ ...CLIENT, notes: "Cliente de teste" })
    const w = await mountSuspended(ClientForm, {
      props: { client: CLIENT },
      attachTo: document.body,
    })
    expect(input(w, "cnpj").disabled).toBe(true)
    await w.find('textarea[name="notes"]').setValue("Cliente de teste")
    await w.find("form").trigger("submit")
    await settle()
    expect(api.update).toHaveBeenCalledWith(CLIENT.id, {
      legalName: CLIENT.legalName,
      tradeName: "LOJA EXEMPLO",
      notes: "Cliente de teste",
    })
    const notice = w.find("[role=status]")
    expect(notice.text()).toContain("Alterações salvas.")
    expect(document.activeElement).toBe(notice.element)
  })
})

describe("delete dialog", () => {
  it("confirms in the page, mentions the audit and deletes", async () => {
    api.remove.mockResolvedValue(null)
    const w = await mountSuspended(DeleteDialog, {
      props: { client: CLIENT, open: true },
      attachTo: document.body,
    })
    await settle()
    const dialog = document.querySelector("[role=dialog]")
    expect(dialog?.textContent).toContain("Excluir EMPRESA FICTICIA DE TESTES LTDA?")
    expect(dialog?.textContent).toContain("histórico de auditoria")
    document.querySelector<HTMLButtonElement>("[data-action=confirm-delete]")?.click()
    await settle()
    expect(api.remove).toHaveBeenCalledWith(CLIENT.id)
    expect(w.emitted("deleted")?.[0]).toEqual([CLIENT])
    expect(w.emitted("update:open")?.at(-1)).toEqual([false])
  })

  it("keeps the dialog open with the error when the delete fails", async () => {
    api.remove.mockRejectedValue(fail(500))
    const w = await mountSuspended(DeleteDialog, {
      props: { client: CLIENT, open: true },
      attachTo: document.body,
    })
    await settle()
    document.querySelector<HTMLButtonElement>("[data-action=confirm-delete]")?.click()
    await settle()
    expect(document.querySelector("[role=dialog] [role=alert]")?.textContent).toContain(
      "Algo deu errado",
    )
    expect(w.emitted("deleted")).toBeUndefined()
  })
})
