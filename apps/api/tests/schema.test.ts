import { readFileSync } from "node:fs"
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import { describe, expect, it } from "vitest"
import * as schema from "../src/db/schema.js"

const META = new URL("../drizzle/meta/", import.meta.url)

// The migrations are SQL committed next to drizzle-kit's snapshots. If schema.ts changes without
// `db:generate`, the next generated migration would carry someone else's diff; this catches it.
describe("drizzle snapshot", () => {
  it("matches src/db/schema.ts (run db:generate after a schema change)", async () => {
    const journal = JSON.parse(readFileSync(new URL("_journal.json", META), "utf8")) as {
      entries: { idx: number }[]
    }
    const last = Math.max(...journal.entries.map((e) => e.idx))
    const file = `${String(last).padStart(4, "0")}_snapshot.json`
    const snapshot = JSON.parse(readFileSync(new URL(file, META), "utf8")) as Parameters<
      typeof generateMigration
    >[0]
    const pending = await generateMigration(snapshot, generateDrizzleJson(schema))
    expect(pending).toEqual([])
  })
})
