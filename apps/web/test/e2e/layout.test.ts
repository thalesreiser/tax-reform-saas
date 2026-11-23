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

  it("renders the placeholder home page in pt-BR", async () => {
    const html = await $fetch<string>("/")
    expect(html).toContain("<h1")
    expect(html).toContain("tax-reform-saas")
    expect(html).toContain("Em construção.")
    expect(html).toContain(`© ${new Date().getFullYear()} tax-reform-saas`)
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
