// Temporary preview tool (branch ci/web-screenshots, never merged): serves the built web app against
// a mocked API and saves screenshots of the main screens, desktop and mobile, light and dark.
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

const WEB = "http://localhost:3000"
const API_PORT = 4010
const COOKIE = { name: "trs.session_token", value: "preview-session" }
const INVITATION_ID = "0b6f2c1e-5d4a-4f3b-9c2d-1a2b3c4d5e6f"
const session = {
  user: { id: "u1", email: "ana@escritorio-exemplo.com.br", name: "Ana Exemplo", emailVerified: true },
  session: { activeOrganizationId: "o1" },
}

function send(req, res, status, body) {
  res.writeHead(status, {
    "content-type": status >= 400 ? "application/problem+json" : "application/json",
    "access-control-allow-origin": WEB,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  })
  res.end(body === undefined ? "" : JSON.stringify(body))
}

const api = createServer((req, res) => {
  if (req.method === "OPTIONS") return send(req, res, 204)
  const url = new URL(req.url ?? "/", "http://api.preview")
  const signedIn = (req.headers.cookie ?? "").includes(`${COOKIE.name}=${COOKIE.value}`)
  if (url.pathname === "/api/auth/get-session") return send(req, res, 200, signedIn ? session : null)
  if (url.pathname === "/api/auth/organization/get-invitation") {
    if (!signedIn) return send(req, res, 401, { status: 401, title: "Unauthorized" })
    return send(req, res, 200, {
      id: INVITATION_ID,
      email: session.user.email,
      role: "accountant",
      organizationName: "Contabilidade Exemplo",
    })
  }
  if (!signedIn) return send(req, res, 401, { status: 401, title: "Unauthorized" })
  if (url.pathname === "/office") return send(req, res, 200, { id: "o1", name: "Escritório Contábil Exemplo", role: "owner" })
  return send(req, res, 404, { status: 404 })
})
await new Promise((r) => api.listen(API_PORT, "127.0.0.1", r))

const web = spawn("node", ["apps/web/.output/server/index.mjs"], {
  env: { ...process.env, PORT: "3000", NUXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}` },
  stdio: "inherit",
})
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(WEB)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 1000))
}

const pages = [
  ["home", "/", false],
  ["entrar", "/entrar", false],
  ["cadastro", "/cadastro", false],
  ["convite", `/convites/${INVITATION_ID}`, true],
  ["painel", "/painel", true],
]
const viewports = [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]
mkdirSync("shots", { recursive: true })
const browser = await chromium.launch()
for (const scheme of ["light", "dark"]) {
  for (const [vName, viewport] of viewports) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 2, locale: "pt-BR", isMobile: vName === "mobile" })
    await ctx.addCookies([
      { ...COOKIE, domain: "localhost", path: "/" },
      { ...COOKIE, domain: "127.0.0.1", path: "/" },
    ])
    for (const [name, path, auth] of pages) {
      if (!auth) await ctx.clearCookies()
      else await ctx.addCookies([{ ...COOKIE, domain: "localhost", path: "/" }, { ...COOKIE, domain: "127.0.0.1", path: "/" }])
      const page = await ctx.newPage()
      await page.goto(WEB + path, { waitUntil: "networkidle" })
      await page.waitForTimeout(600)
      await page.screenshot({ path: `shots/${name}-${vName}-${scheme}.png`, fullPage: true })
      await page.close()
    }
    await ctx.close()
  }
}
await browser.close()
web.kill()
api.close()
