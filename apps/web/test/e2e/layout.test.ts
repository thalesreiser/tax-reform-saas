import { fileURLToPath } from "node:url"
import { $fetch, fetch, setup } from "@nuxt/test-utils/e2e"
import { describe, expect, it } from "vitest"

await setup({ rootDir: fileURLToPath(new URL("../..", import.meta.url)) })

describe("base layout (server-rendered)", () => {
  it("declares the page language as pt-BR", async () => {
    const html = await $fetch<string>("/")
    expect(html).toMatch(/<html[^>]*\slang="pt-BR"/)
  })

  it("renders the landmarks in order with a skip link to the main content", async () => {
    const html = await $fetch<string>("/")
    expect(html).toMatch(/<a[^>]*href="#conteudo"[^>]*>\s*Pular para o conteúdo principal\s*<\/a>/)
    expect(html).toMatch(/<main[^>]*id="conteudo"/)

    const header = html.indexOf("<header")
    const main = html.indexOf("<main")
    const footer = html.indexOf("<footer")
    expect(header).toBeGreaterThan(-1)
    expect(main).toBeGreaterThan(header)
    expect(footer).toBeGreaterThan(main)
  })

  it("renders the placeholder home page in pt-BR with its two entry points", async () => {
    const html = await $fetch<string>("/")
    expect(html.match(/<h1b/g)).toHaveLength(1)
    expect(html).toContain("Mostre a cada cliente quanto a reforma tributária muda para ele")
    expect(html).toMatch(/<a[^>]*href="\/cadastro"[^>]*>[\s\S]*?Criar conta/)
    expect(html).toMatch(/<a[^>]*href="\/entrar"[^>]*>[\s\S]*?Já tenho conta/)
    expect(html).toContain(`© ${new Date().getFullYear()} tax-reform-saas`)
  })

  it("offers sign-in, sign-up and a labelled colour-mode toggle in the header", async () => {
    const html = await $fetch<string>("/")
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"))
    expect(header).toContain("tax-reform-saas")
    expect(header).toMatch(/href="\/entrar"[^>]*>[\s\S]*?Entrar/)
    expect(header).toMatch(/href="\/cadastro"[^>]*>[\s\S]*?Criar conta/)
    expect(header).toMatch(/<button[^>]*aria-label="Mudar para modo escuro"/)
  })

  it("loads fonts, styles and scripts only from the app itself", async () => {
    const html = await $fetch<string>("/")
    const urls = [...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/g)].map(
      (m) => m[1] ?? "",
    )
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).not.toMatch(/^(?:[a-z]+:)?\/\//i)

    // Outfit is bundled: the stylesheets declare it and reference no external host.
    const stylesheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
    const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "")
    const linked = await Promise.all(stylesheets.map((m) => $fetch<string>(m[1] ?? "")))
    const css = [...inline, ...linked].join("\n")
    expect(css).toContain("Outfit Variable")
    expect(css).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i)
    expect(css).not.toMatch(/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i)
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic|bunny)\.|use\.typekit\.net/)
  })

  it("renders the error page inside the layout with a 404 status", async () => {
    // A browser navigation asks for HTML; without it Nuxt answers with the JSON error payload.
    const response = await fetch("/pagina-que-nao-existe", { headers: { accept: "text/html" } })
    expect(response.status).toBe(404)

    const html = await response.text()
    expect(html).toMatch(/<html[^>]*\slang="pt-BR"/)
    expect(html).toContain("Página não encontrada")
    expect(html).toContain("Voltar para a página inicial")
    expect(html).toMatch(/<main[^>]*id="conteudo"/)
  })
})
