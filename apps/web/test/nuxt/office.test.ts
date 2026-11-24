// Office settings components in the Nuxt runtime, with the API composable mocked. Fictional data.
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime"
import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import BrandSettings from "../../app/components/office/BrandSettings.vue"
import ProfileForm from "../../app/components/office/ProfileForm.vue"
import RemoveMemberDialog from "../../app/components/office/RemoveMemberDialog.vue"
import TeamSection from "../../app/components/office/TeamSection.vue"
import type { Member, OfficeSettings, PendingInvitation } from "../../app/utils/office"

const api = vi.hoisted(() => ({
  logoSrc: vi.fn(() => "http://api.test/v1/office/logo?v=1"),
  get: vi.fn(),
  update: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
  members: vi.fn(),
  changeRole: vi.fn(),
  removeMember: vi.fn(),
  invitations: vi.fn(),
  invite: vi.fn(),
  cancelInvitation: vi.fn(),
  resendInvitation: vi.fn(),
}))
mockNuxtImport("useOfficeSettings", () => () => api)

const SETTINGS: OfficeSettings = {
  id: "0a1b2c3d-1111-4222-8333-444455556666",
  name: "Escritório Fictício Ltda",
  role: "owner",
  cnpj: "11222333000181",
  contactEmail: "contato@example.com",
  contactPhone: "(11) 4000-0000",
  brandColor: "#6D4AFF",
  brandContrast: { onWhite: 5.15, onBlack: 4.08, meetsAaOnWhite: true, meetsAaOnBlack: false },
  logo: null,
  updatedAt: "2026-11-24T17:05:00.000Z",
}
const ACCOUNTANT: OfficeSettings = { ...SETTINGS, role: "accountant" }
const MEMBERS: Member[] = [
  {
    id: "1a1a1a1a-1111-4111-8111-111111111111",
    userId: "u1",
    name: "Ana Teste",
    email: "ana@example.com",
    role: "owner",
    joinedAt: "2026-11-01T12:00:00.000Z",
  },
  {
    id: "2b2b2b2b-2222-4222-8222-222222222222",
    userId: "u2",
    name: "Bruno Exemplo",
    email: "bruno@example.com",
    role: "accountant",
    joinedAt: "2026-11-10T12:00:00.000Z",
  },
]
const INVITATIONS: PendingInvitation[] = [
  {
    id: "3c3c3c3c-3333-4333-8333-333333333333",
    email: "carla@example.com",
    role: "accountant",
    expiresAt: "2026-11-26T12:00:00.000Z",
    createdAt: "2026-11-24T12:00:00.000Z",
  },
]
const fail = (status: number) => Object.assign(new Error("failed"), { response: { status } })

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
  }
}

async function pick(w: { find: (s: string) => { element: Element } }, file: File) {
  const el = w.find('input[type="file"]').element as HTMLInputElement
  Object.defineProperty(el, "files", { value: [file], configurable: true })
  el.dispatchEvent(new Event("change"))
  await settle()
}

const bitmap = vi.fn()
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.logoSrc.mockReturnValue("http://api.test/v1/office/logo?v=1")
  bitmap.mockReset()
  vi.stubGlobal("createImageBitmap", bitmap)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
})

describe("office profile", () => {
  it("lets an owner save and moves focus to the notice", async () => {
    api.update.mockResolvedValue({ ...SETTINGS, name: "Novo Nome Fictício" })
    const w = await mountSuspended(ProfileForm, {
      props: { settings: SETTINGS },
      attachTo: document.body,
    })
    expect((w.find('input[name="cnpj"]').element as HTMLInputElement).value).toBe(
      "11.222.333/0001-81",
    )
    await w.find('input[name="name"]').setValue("Novo Nome Fictício")
    await w.find('input[name="contactPhone"]').setValue("")
    await w.find("form").trigger("submit")
    await settle()
    expect(api.update).toHaveBeenCalledWith({
      name: "Novo Nome Fictício",
      cnpj: "11222333000181",
      contactEmail: "contato@example.com",
      contactPhone: null,
    })
    const notice = w.find("[role=status]")
    expect(notice.text()).toContain("Perfil salvo.")
    expect(document.activeElement).toBe(notice.element)
  })

  it("is read-only for accountants", async () => {
    const w = await mountSuspended(ProfileForm, { props: { settings: ACCOUNTANT } })
    expect(w.find("[data-readonly]").exists()).toBe(true)
    expect((w.find('input[name="name"]').element as HTMLInputElement).disabled).toBe(true)
    expect(w.find('button[type="submit"]').exists()).toBe(false)
  })
})

describe("brand", () => {
  it("previews a typed colour and warns below AA without blocking the save", async () => {
    api.update.mockResolvedValue({ ...SETTINGS, brandColor: "#3AA8FF" })
    const w = await mountSuspended(BrandSettings, { props: { settings: SETTINGS } })
    await w.find('input[name="brandColor"]').setValue("#3aa8ff")
    await settle()
    expect(w.find("[data-contrast]").text()).toContain("abaixo do mínimo")
    const save = w.findAll("button").find((b) => b.text() === "Salvar cor")
    expect(save?.attributes("disabled")).toBeUndefined()
    await save?.trigger("click")
    await settle()
    expect(api.update).toHaveBeenCalledWith({ brandColor: "#3AA8FF" })
    expect(w.find("[data-brand-status]").text()).toBe("Cor da marca salva.")
  })

  it("flags an invalid hex code", async () => {
    const w = await mountSuspended(BrandSettings, { props: { settings: SETTINGS } })
    await w.find('input[name="brandColor"]').setValue("#12")
    await settle()
    expect(w.text()).toContain("Use o formato #RRGGBB")
  })

  it.each([
    [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }), "SVG não são aceitos"],
    [new File([new Uint8Array(200 * 1024 + 1)], "big.png", { type: "image/png" }), "200 KB"],
  ])("rejects %s before uploading", async (file, message) => {
    const w = await mountSuspended(BrandSettings, { props: { settings: SETTINGS } })
    await pick(w, file)
    expect(w.find("[role=alert]").text()).toContain(message)
    expect(api.uploadLogo).not.toHaveBeenCalled()
  })

  it("rejects images outside 16-2048 px before uploading", async () => {
    bitmap.mockResolvedValue({ width: 4000, height: 100, close: vi.fn() })
    const w = await mountSuspended(BrandSettings, { props: { settings: SETTINGS } })
    await pick(w, new File([new Uint8Array(10)], "wide.png", { type: "image/png" }))
    expect(w.find("[role=alert]").text()).toContain("entre 16 e 2048 pixels")
    expect(api.uploadLogo).not.toHaveBeenCalled()
  })

  it("uploads a valid logo and shows the API error when it refuses it", async () => {
    bitmap.mockResolvedValue({ width: 200, height: 100, close: vi.fn() })
    api.uploadLogo.mockRejectedValue(fail(415))
    const w = await mountSuspended(BrandSettings, { props: { settings: SETTINGS } })
    const file = new File([new Uint8Array(10)], "logo.png", { type: "image/png" })
    await pick(w, file)
    expect(api.uploadLogo).toHaveBeenCalledWith(file)
    expect(w.find("[role=alert]").text()).toContain("Formato não aceito")
  })

  it("shows the logo and removes it", async () => {
    api.removeLogo.mockResolvedValue(null)
    const logo = {
      url: "/v1/office/logo",
      contentType: "image/png",
      width: 200,
      height: 100,
      etag: '"abc"',
      updatedAt: SETTINGS.updatedAt,
    }
    const w = await mountSuspended(BrandSettings, { props: { settings: { ...SETTINGS, logo } } })
    expect(w.find('img[alt="Logotipo de Escritório Fictício Ltda"]').exists()).toBe(true)
    await w.find("[data-action=remove-logo]").trigger("click")
    await settle()
    expect(api.removeLogo).toHaveBeenCalled()
    expect(w.emitted("saved")?.[0]).toEqual([{ ...SETTINGS, logo: null }])
    expect(w.find("[data-brand-status]").text()).toBe("Logotipo removido.")
  })

  it("has no editing controls for accountants", async () => {
    const w = await mountSuspended(BrandSettings, { props: { settings: ACCOUNTANT } })
    expect(w.find('input[type="file"]').exists()).toBe(false)
    expect(w.find('input[name="brandColor"]').exists()).toBe(false)
  })
})

describe("team", () => {
  const props = (canManage: boolean) => ({
    officeId: SETTINGS.id,
    canManage,
    currentUserId: "u1",
    initialMembers: MEMBERS,
    initialInvitations: canManage ? INVITATIONS : [],
  })

  it("shows owners the role controls, the invite form and pending invitations", async () => {
    const w = await mountSuspended(TeamSection, { props: props(true) })
    expect(w.find("[data-members]").text()).toContain("Ana Teste (você)")
    expect(w.findAll("[data-action=remove-member]")).toHaveLength(2)
    expect(w.text()).toContain("Convidar pessoa")
    expect(w.find("[data-invitations]").text()).toContain("carla@example.com")
  })

  it("shows accountants the members list only", async () => {
    const w = await mountSuspended(TeamSection, { props: props(false) })
    expect(w.find("[data-members]").text()).toContain("Bruno Exemplo")
    expect(w.find("[data-action=remove-member]").exists()).toBe(false)
    expect(w.text()).not.toContain("Convidar pessoa")
    expect(w.text()).not.toContain("Convites pendentes")
  })

  it("invites through better-auth with the office id and reloads the invitations", async () => {
    api.invite.mockResolvedValue({})
    api.invitations.mockResolvedValue({ items: INVITATIONS })
    const w = await mountSuspended(TeamSection, { props: props(true) })
    await w.find('input[name="email"]').setValue("nova@example.com")
    await w.find("form").trigger("submit")
    await settle()
    expect(api.invite).toHaveBeenCalledWith({
      email: "nova@example.com",
      role: "accountant",
      organizationId: SETTINGS.id,
    })
    expect(w.find("[data-team-status]").text()).toBe("Convite enviado para nova@example.com.")
  })

  it("cancels and resends invitations", async () => {
    api.resendInvitation.mockResolvedValue(null)
    api.invitations.mockResolvedValue({ items: INVITATIONS })
    api.cancelInvitation.mockResolvedValue(null)
    const w = await mountSuspended(TeamSection, { props: props(true) })
    const button = (label: string) => w.findAll("button").find((b) => b.text() === label)
    await button("Reenviar")?.trigger("click")
    await settle()
    expect(api.resendInvitation).toHaveBeenCalledWith(INVITATIONS[0]?.id)
    await button("Cancelar convite")?.trigger("click")
    await settle()
    expect(api.cancelInvitation).toHaveBeenCalledWith(INVITATIONS[0]?.id)
    expect(w.text()).toContain("Nenhum convite pendente.")
  })
})

describe("remove member dialog", () => {
  it("confirms in the page and removes", async () => {
    api.removeMember.mockResolvedValue(null)
    const w = await mountSuspended(RemoveMemberDialog, {
      props: { member: MEMBERS[1] ?? null, open: true },
      attachTo: document.body,
    })
    await settle()
    expect(document.querySelector("[role=dialog]")?.textContent).toContain(
      "Remover Bruno Exemplo do escritório?",
    )
    document.querySelector<HTMLButtonElement>("[data-action=confirm-remove]")?.click()
    await settle()
    expect(api.removeMember).toHaveBeenCalledWith(MEMBERS[1]?.id)
    expect(w.emitted("removed")?.[0]).toEqual([MEMBERS[1]])
    expect(w.emitted("update:open")?.at(-1)).toEqual([false])
  })

  it("explains the last-owner rule on a 409 and keeps the dialog open", async () => {
    api.removeMember.mockRejectedValue(fail(409))
    const w = await mountSuspended(RemoveMemberDialog, {
      props: { member: MEMBERS[0] ?? null, open: true },
      attachTo: document.body,
    })
    await settle()
    document.querySelector<HTMLButtonElement>("[data-action=confirm-remove]")?.click()
    await settle()
    expect(document.querySelector("[role=dialog] [role=alert]")?.textContent).toContain(
      "pelo menos um proprietário",
    )
    expect(w.emitted("removed")).toBeUndefined()
  })
})
