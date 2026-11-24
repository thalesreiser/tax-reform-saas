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

function mockApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://api.test")
  const signedIn = (req.headers.cookie ?? "").includes(COOKIE)
  if (url.pathname === "/api/auth/get-session") return send(res, 200, signedIn ? session : null)
  if (!signedIn) return send(res, 401, { status: 401, title: "Unauthorized" })
  if (url.pathname === "/office") {
    return send(res, 200, { id: "o1", name: "Escritório Fictício Ltda", role: "owner" })
  }
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
    expect(html).toContain("Cadastre o primeiro cliente para começar.")
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Cadastrar cliente/)
    expect(html).toContain("Em breve")
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
