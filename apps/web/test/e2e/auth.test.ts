import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { fileURLToPath } from "node:url"
import { $fetch, fetch, setup } from "@nuxt/test-utils/e2e"
import { afterAll, describe, expect, it } from "vitest"

// Stand-in for apps/api: only what server rendering calls. The web suite never needs the real API.
const COOKIE = "trs.session_token=test-session"
const INVITATION_ID = "0b6f2c1e-5d4a-4f3b-9c2d-1a2b3c4d5e6f"
const EXPIRED_ID = "9f8e7d6c-5b4a-4321-8fed-cba987654321"
const session = {
  user: { id: "u1", email: "convidada@example.com", name: "Ana Teste", emailVerified: true },
  session: { activeOrganizationId: "o1" },
}

function send(res: ServerResponse, status: number, body: unknown) {
  const type = status >= 400 ? "application/problem+json" : "application/json"
  res.writeHead(status, { "content-type": type }).end(JSON.stringify(body))
}

// Fictional companies and generated CNPJs only.
const EMPTY_OFFICE = "trs.session_token=empty-office"
const CLIENTS = [
  {
    id: "3c0f6d8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    cnpj: "11222333000181",
    legalName: "Padaria Exemplo Ltda",
    tradeName: "Pão Fictício",
    registrationStatus: "ATIVA",
    taxRegime: "simples_nacional",
    lookup: { source: "brasilapi", fetchedAt: "2026-11-24T17:05:00.000Z" },
    notes: null,
  },
  {
    id: "4d1a7e9f-2b3c-4d4e-9f0a-1b2c3d4e5f60",
    cnpj: "12ABC34501DE35",
    legalName: "Oficina Teste S.A.",
    tradeName: null,
    registrationStatus: null,
    taxRegime: "unknown",
    lookup: null,
    notes: null,
  },
]

function listClients(url: URL, empty: boolean) {
  const q = (url.searchParams.get("q") ?? "").toLowerCase()
  const prefix = q.replace(/[\s./-]/g, "").toUpperCase()
  const items = (empty ? [] : CLIENTS).filter(
    (c) =>
      q === "" ||
      c.legalName.toLowerCase().includes(q) ||
      (c.tradeName ?? "").toLowerCase().includes(q) ||
      (prefix !== "" && c.cnpj.startsWith(prefix)),
  )
  return { items, page: 1, pageSize: Number(url.searchParams.get("pageSize")), total: items.length }
}

// Office settings (FE-02.4). The accountant cookie signs in the same user with that role.
const ACCOUNTANT = "trs.session_token=accountant"
const OFFICE = {
  id: "0a1b2c3d-1111-4222-8333-444455556666",
  name: "Escritório Fictício Ltda",
  cnpj: "11222333000181",
  contactEmail: "contato@example.com",
  contactPhone: "(11) 4000-0000",
  brandColor: "#3AA8FF",
  brandContrast: { onWhite: 2.55, onBlack: 8.23, meetsAaOnWhite: false, meetsAaOnBlack: true },
  logo: null,
  updatedAt: "2026-11-24T17:05:00.000Z",
}
const MEMBERS = [
  {
    id: "1a1a1a1a-1111-4111-8111-111111111111",
    userId: "u1",
    name: "Ana Teste",
    email: "convidada@example.com",
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
const INVITATIONS = [
  {
    id: "3c3c3c3c-3333-4333-8333-333333333333",
    email: "carla@example.com",
    role: "accountant",
    expiresAt: "2026-11-26T12:00:00.000Z",
    createdAt: "2026-11-24T12:00:00.000Z",
  },
]

function mockApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://api.test")
  const empty = (req.headers.cookie ?? "").includes(EMPTY_OFFICE)
  const signedIn =
    (req.headers.cookie ?? "").includes(COOKIE) ||
    empty ||
    (req.headers.cookie ?? "").includes(ACCOUNTANT)
  if (url.pathname === "/api/auth/get-session") return send(res, 200, signedIn ? session : null)
  if (!signedIn) return send(res, 401, { status: 401, title: "Unauthorized" })
  const role = (req.headers.cookie ?? "").includes(ACCOUNTANT) ? "accountant" : "owner"
  if (url.pathname === "/office") {
    return send(res, 200, { id: "o1", name: "Escritório Fictício Ltda", role })
  }
  if (url.pathname === "/v1/office") return send(res, 200, { ...OFFICE, role })
  if (url.pathname === "/v1/office/members") return send(res, 200, { items: MEMBERS })
  if (url.pathname === "/v1/office/invitations") {
    if (role !== "owner") return send(res, 403, { status: 403 })
    return send(res, 200, { items: INVITATIONS })
  }
  if (url.pathname === "/v1/clients") return send(res, 200, listClients(url, empty))
  const client = CLIENTS.find((c) => url.pathname === `/v1/clients/${c.id}`)
  if (client) return send(res, 200, client)
  if (url.pathname.startsWith("/v1/clients/")) return send(res, 404, { status: 404 })
  if (url.pathname === "/api/auth/organization/get-invitation") {
    if (url.searchParams.get("id") === INVITATION_ID) {
      return send(res, 200, {
        id: INVITATION_ID,
        email: session.user.email,
        role: "accountant",
        organizationName: "Contabilidade Exemplo",
      })
    }
    return send(res, 400, { status: 400, code: "INVITATION_NOT_FOUND" })
  }
  return send(res, 404, { status: 404 })
}

const api = createServer(mockApi)
await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve))
afterAll(() => new Promise<void>((resolve) => api.close(() => resolve())))

await setup({
  rootDir: fileURLToPath(new URL("../..", import.meta.url)),
  env: { NUXT_PUBLIC_API_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
})

const page = (path: string, cookie?: string) =>
  $fetch<string>(path, { headers: cookie ? { cookie } : {} })

describe("auth screens (server-rendered, mocked API)", () => {
  it.each([
    ["/entrar", "Entrar"],
    ["/cadastro", "Criar conta"],
    ["/esqueci-senha", "Esqueci minha senha"],
    ["/redefinir-senha?token=abc", "Redefinir senha"],
    ["/verificar-email", "Confirmar e-mail"],
  ])("%s renders one h1, labelled fields and only same-app assets", async (path, title) => {
    const html = await page(path)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toMatch(new RegExp(`<h1[^>]*>\\s*${title}\\s*</h1>`))
    expect(html).toMatch(/<label[^>]*for="[^"]+"/)
    expect(html).toMatch(/<main[^>]*id="conteudo"/)
    const urls = [...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/g)]
    for (const [, url] of urls) expect(url).not.toMatch(/^(?:[a-z]+:)?\/\//i)
  })

  it.each(["/entrar", "/cadastro"])("%s puts the form beside the brand panel", async (path) => {
    const html = await page(path)
    const form = html.search(/<section[^>]*aria-labelledby="[^"]+"/)
    const brand = html.search(/<aside[^>]*aria-label="Sobre o produto"/)
    expect(form).toBeGreaterThan(-1)
    // The form comes first in reading order (and on phones); the panel follows it.
    expect(brand).toBeGreaterThan(form)
    expect(html).toMatch(
      /<svg[^>]*role="img"[^>]*aria-label="Exemplo ilustrativo com dados fictícios/,
    )
    // The header carries the wordmark; the card no longer repeats it.
    expect(html.match(/tax-reform-saas<\/span>/g)).toHaveLength(1)
  })

  it("shows in the header only the auth action of the other page", async () => {
    const header = (html: string) => html.slice(html.indexOf("<header"), html.indexOf("</header>"))
    const signIn = header(await page("/entrar"))
    expect(signIn).toMatch(/href="\/cadastro"/)
    expect(signIn).not.toMatch(/href="\/entrar"/)
    const signUp = header(await page("/cadastro?redirect=/convites/abc"))
    expect(signUp).toMatch(/href="\/entrar\?redirect=(?:%2F|\/)convites(?:%2F|\/)abc"/)
    expect(signUp).not.toMatch(/href="\/cadastro/)
  })

  it.each([
    ["/entrar", "current-password"],
    ["/cadastro", "new-password"],
    ["/redefinir-senha?token=abc", "new-password"],
  ])("%s has a password field with an accessible show/hide toggle", async (path, autocomplete) => {
    const html = await page(path)
    expect(html).toMatch(
      new RegExp(`<input[^>]*type="password"[^>]*autocomplete="${autocomplete}"`),
    )
    expect(html).toMatch(
      /<button[^>]*aria-label="Mostrar senha"[^>]*aria-pressed="false"|<button[^>]*aria-pressed="false"[^>]*aria-label="Mostrar senha"/,
    )
  })

  it("states the minimum password length under new-password fields", async () => {
    expect(await page("/cadastro")).toContain("Use pelo menos 10 caracteres.")
    expect(await page("/redefinir-senha?token=abc")).toContain("Use pelo menos 10 caracteres.")
  })

  it("asks for the office name on sign-up, except for invitees", async () => {
    expect(await page("/cadastro")).toContain("Nome do escritório")
    const invitee = await page(`/cadastro?redirect=/convites/${INVITATION_ID}`)
    expect(invitee).not.toContain("Nome do escritório")
  })

  it("shows the result of the verification link", async () => {
    expect(await page("/verificar-email?confirmado=1")).toContain("Seu e-mail foi confirmado.")
    const failed = await page("/verificar-email?confirmado=1&error=TOKEN_EXPIRED")
    expect(failed).toContain("Este link é inválido ou expirou.")
    expect(await page("/redefinir-senha?error=INVALID_TOKEN")).toContain("Pedir um novo link")
  })

  it("redirects anonymous visitors of the dashboard to sign-in", async () => {
    const response = await fetch("/painel", {
      redirect: "manual",
      headers: { accept: "text/html" },
    })
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toMatch(/^\/entrar\?redirect=(?:%2F|\/)painel$/)
  })

  it("shows the office and role on the dashboard when signed in", async () => {
    const html = await page("/painel", COOKIE)
    expect(html).toContain("Escritório Fictício Ltda")
    expect(html).toContain("Seu papel: Proprietário")
  })

  it("shows empty KPI tiles and a disabled first action, never sample numbers", async () => {
    const html = await page("/painel", COOKIE)
    const tiles = html.slice(html.search(/<ul[^>]*aria-label="Resumo do escritório"/))
    for (const label of ["Clientes", "Simulações no mês", "Chamadas à API"]) {
      expect(tiles).toContain(label)
    }
    // Text nodes only (between tags), so class names with digits do not count.
    const list = tiles.slice(0, tiles.indexOf("</ul>"))
    const text = [...list.matchAll(/>([^<]*)</g)].map((m) => m[1] ?? "").join(" ")
    expect(text).toContain("—")
    expect(text).not.toMatch(/\d/)
  })

  it("shows a new office the step-by-step to register its first client", async () => {
    const html = await page("/painel", COOKIE)
    const start = html.search(/<section[^>]*aria-labelledby="onboarding-title"/)
    expect(start).toBeGreaterThan(-1)
    const section = html.slice(start, html.indexOf("</section>", start))
    expect(section).toMatch(/<h2[^>]*id="onboarding-title"[^>]*>\s*Primeiros passos/)
    const steps = [
      "Cadastrar o primeiro cliente",
      "Completar o perfil fiscal",
      "Rodar a primeira simulação",
      "Convidar a equipe",
    ]
    for (const step of steps) expect(section).toContain(step)
    expect(section).toContain("0 de 4 concluídos")
    // The first step is the highlighted next action and links to the new-client form; the others
    // have no page yet.
    expect(section).toMatch(
      /<li[^>]*surface-brand[^>]*aria-current="step"[\s\S]*?Cadastrar o primeiro/,
    )
    expect(section.match(/aria-current="step"/g)).toHaveLength(1)
    expect(section.match(/aria-disabled="true"/g)).toHaveLength(3)
    expect(section.match(/<a\s[^>]*href="[^"]*"/g)?.join()).toMatch(
      /^<a[^>]*href="\/clientes\/novo"$/,
    )
  })

  it("shows the portfolio and recent simulations empty states", async () => {
    const html = await page("/painel", COOKIE)
    expect(html).toContain("Impacto da reforma na carteira")
    expect(html).toContain("ordenados pelo impacto da reforma em 2033")
    expect(html).toContain("Últimas simulações")
    expect(html).toContain("Nenhuma simulação ainda.")
    expect(html).not.toContain("<table")
  })

  it("renders the signed-in shell: one h1, labelled navigation and disabled future pages", async () => {
    const html = await page("/painel", COOKIE)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toMatch(/<main[^>]*id="conteudo"/)
    expect(html).toMatch(/<a[^>]*href="#conteudo"/)
    const navs = [
      ...html.matchAll(/<nav[^>]*aria-label="Navegação principal"[^>]*>([\s\S]*?)<\/nav>/g),
    ]
    expect(navs.length).toBeGreaterThan(0)
    const nav = navs[0]?.[1] ?? ""
    expect(nav).toMatch(
      /<a[^>]*href="\/painel"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/painel"/,
    )
    expect(nav).toMatch(/<a[^>]*href="\/clientes"[^>]*>[\s\S]*?Clientes/)
    expect(nav).toMatch(/<a[^>]*href="\/escritorio"[^>]*>[\s\S]*?Escritório/)
    for (const label of ["Simulações", "Chaves de API"]) {
      expect(nav).toMatch(
        new RegExp(`<a[^>]*aria-disabled="true"[^>]*>[\\s\\S]*?${label}[\\s\\S]*?Em breve`),
      )
    }
    expect(nav.match(/href=/g)).toHaveLength(3)
  })

  it("offers a menu toggle for the navigation drawer on small screens", async () => {
    const html = await page("/painel", COOKIE)
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"))
    expect(header).toMatch(/<button[^>]*aria-label="[^"]*menu[^"]*"/i)
  })

  it("shows the office and an account menu in the header when signed in", async () => {
    const html = await page("/painel", COOKIE)
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"))
    expect(header).toContain("Escritório Fictício Ltda")
    expect(header).toMatch(/<button[^>]*aria-haspopup="menu"[\s\S]*?Ana Teste/)
    expect(header).not.toMatch(/href="\/(?:entrar|cadastro)"/)
    expect(header).toMatch(/aria-label="Mudar para modo escuro"/)
  })

  it("asks anonymous invitees to sign in or sign up, coming back to the invitation", async () => {
    const html = await page(`/convites/${INVITATION_ID}`)
    expect(html).toContain("entre ou crie sua conta com o e-mail que recebeu o convite")
    for (const target of ["entrar", "cadastro"]) {
      const back = `href="/${target}\\?redirect=(?:%2F|/)convites(?:%2F|/)${INVITATION_ID}"`
      expect(html).toMatch(new RegExp(back))
    }
  })

  it("shows the office and role of the invitation to the signed-in invitee", async () => {
    const html = await page(`/convites/${INVITATION_ID}`, COOKIE)
    expect(html).toContain(
      "Você foi convidado para o escritório Contabilidade Exemplo como Contador.",
    )
    expect(html).toContain("Aceitar convite")
  })

  it("explains when an invitation expired or was already used", async () => {
    const html = await page(`/convites/${EXPIRED_ID}`, COOKIE)
    expect(html).toContain("Este convite não está mais disponível")
    expect(html).not.toContain("Aceitar convite")
  })
})

describe("client screens (server-rendered, mocked API)", () => {
  it("redirects anonymous visitors to sign-in", async () => {
    const response = await fetch("/clientes", {
      redirect: "manual",
      headers: { accept: "text/html" },
    })
    expect(response.status).toBe(302)
  })

  it("lists clients with formatted CNPJs, status and the regime the registry reported", async () => {
    const html = await page("/clientes", COOKIE)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"))
    expect(table).toMatch(/<caption[^>]*>\s*Clientes do escritório/)
    expect(table).toContain("Padaria Exemplo Ltda")
    expect(table).toContain("Pão Fictício")
    expect(table).toContain("11.222.333/0001-81")
    expect(table).toContain("12.ABC.345/01DE-35")
    expect(table).toContain("ATIVA")
    expect(table).toContain("Simples Nacional")
    expect(table).toContain("Não informado pela fonte")
    expect(table).toMatch(/aria-label="Excluir Padaria Exemplo Ltda"/)
    // Phones get cards with the same clients.
    expect(html).toMatch(/<ul[^>]*md:hidden[\s\S]*?Oficina Teste S\.A\./)
    expect(html).toMatch(/<input[^>]*type="search"/)
  })

  it("filters by name and by CNPJ prefix from the address", async () => {
    const byName = await page("/clientes?q=oficina", COOKIE)
    expect(byName).toContain("Oficina Teste S.A.")
    expect(byName).not.toContain("Padaria Exemplo Ltda")
    const byCnpj = await page("/clientes?q=11.222", COOKIE)
    expect(byCnpj).toContain("Padaria Exemplo Ltda")
    expect(byCnpj).not.toContain("Oficina Teste S.A.")
    expect(await page("/clientes?q=zzz", COOKIE)).toContain("Nenhum cliente encontrado para")
  })

  it("shows a new office the empty state linking to the form", async () => {
    const html = await page("/clientes", EMPTY_OFFICE)
    expect(html).toContain("Nenhum cliente cadastrado ainda.")
    expect(html).not.toContain("<table")
    expect(html).toMatch(/<a[^>]*href="\/clientes\/novo"/)
  })

  it("renders the new-client form with a labelled CNPJ field and a live lookup status", async () => {
    const html = await page("/clientes/novo", COOKIE)
    expect(html).toMatch(/<h1[^>]*>\s*Novo cliente/)
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>[\s\S]*?CNPJ/)
    expect(html).toMatch(/<input[^>]*name="cnpj"/)
    expect(html).toMatch(/aria-live="polite"/)
    expect(html).toContain("CNPJ alfanumérico")
  })

  it("renders a client for editing with its lookup source", async () => {
    const html = await page(`/clientes/${CLIENTS[0]?.id ?? ""}`, COOKIE)
    expect(html).toMatch(/<h1[^>]*>\s*Padaria Exemplo Ltda/)
    expect(html).toContain("Dados preenchidos pela Receita via BrasilAPI em 24/11/2026, 14:05.")
    expect(html).toMatch(
      /<input[^>]*value="11.222.333\/0001-81"[^>]*disabled|<input[^>]*disabled[^>]*value="11.222.333\/0001-81"/,
    )
  })

  it("explains when a client does not exist", async () => {
    const html = await page("/clientes/5e2b8f0a-3c4d-4e5f-8a1b-2c3d4e5f6a7b", COOKIE)
    expect(html).toContain("Cliente não encontrado")
  })
})

describe("office settings (server-rendered, mocked API)", () => {
  it("redirects anonymous visitors to sign-in", async () => {
    const response = await fetch("/escritorio", {
      redirect: "manual",
      headers: { accept: "text/html" },
    })
    expect(response.status).toBe(302)
  })

  it("shows owners the editable profile, brand warning, team and invitations", async () => {
    const html = await page("/escritorio", COOKIE)
    expect(html.match(/<h1b/g)).toHaveLength(1)
    for (const id of ["perfil", "marca", "equipe", "chaves"]) {
      expect(html).toMatch(new RegExp(`<section[^>]*id="${id}"`))
    }
    expect(html).toMatch(/<input[^>]*value="11.222.333\/0001-81"/)
    expect(html).toContain("Salvar perfil")
    expect(html).toContain("abaixo do mínimo de acessibilidade")
    expect(html).toContain("Bruno Exemplo")
    expect(html).toContain("Convidar pessoa")
    expect(html).toContain("carla@example.com")
    expect(html).toMatch(/aria-live="polite"/)
    expect(html).toContain("Em breve")
  })

  it("shows accountants a read-only profile and the members list only", async () => {
    const html = await page("/escritorio", ACCOUNTANT)
    expect(html).toContain("Somente proprietários podem alterar estas informações.")
    expect(html).not.toContain("Salvar perfil")
    expect(html).toContain("Bruno Exemplo")
    expect(html).not.toContain("Convidar pessoa")
    expect(html).not.toContain("carla@example.com")
    expect(html).not.toMatch(/<input[^>]*type="file"/)
  })
})
