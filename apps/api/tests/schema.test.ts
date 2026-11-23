import { readFileSync } from "node:fs"
import * as drizzleKit from "drizzle-kit/api"
import { describe, expect, it } from "vitest"
import * as schema from "../src/db/schema.js"

const META = new URL("../drizzle/meta/", import.meta.url)

// drizzle-kit's snapshot types come from a zod it does not depend on, so they do not resolve here.
const kit = drizzleKit as unknown as {
  generateDrizzleJson(imports: Record<string, unknown>): unknown
  generateMigration(prev: unknown, cur: unknown): Promise<string[]>
}

// The migrations are SQL committed next to drizzle-kit's snapshots. If schema.ts changes without
// `db:generate`, the next generated migration would carry someone else's diff; this catches it.
describe("drizzle snapshot", () => {
  it("matches src/db/schema.ts (run db:generate after a schema change)", async () => {
    const journal = JSON.parse(readFileSync(new URL("_journal.json", META), "utf8")) as {
      entries: { idx: number }[]
    }
    const last = Math.max(...journal.entries.map((e) => e.idx))
    const file = `${String(last).padStart(4, "0")}_snapshot.json`
    const snapshot: unknown = JSON.parse(readFileSync(new URL(file, META), "utf8"))
    const pending = await kit.generateMigration(snapshot, kit.generateDrizzleJson(schema))
    expect(pending).toEqual([])
  })
})
