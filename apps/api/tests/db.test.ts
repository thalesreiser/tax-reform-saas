import { describe, expect, it } from "vitest"
import { ZodError } from "zod"
import { createDb, withOffice } from "../src/db/client.js"

// No database here: the pool connects lazily, so these cases must fail before any query.
describe("withOffice", () => {
  it.each(["", "not-a-uuid", "1; reset role", "00000000-0000-0000-0000-00000000000g"])(
    "rejects the office id %j without touching the database",
    async (officeId) => {
      const db = createDb("postgres://nobody@127.0.0.1:1/none")
      let called = false
      const run = withOffice(db, officeId, () => {
        called = true
        return Promise.resolve()
      })
      await expect(run).rejects.toBeInstanceOf(ZodError)
      expect(called).toBe(false)
      await db.close()
    },
  )

  it("rejects a handle that did not come from createDb", async () => {
    const fake = { close: () => Promise.resolve() }
    await expect(
      withOffice(fake, "7d1f9a52-3c64-4c1e-9a8e-2f5b6c7d8e9f", () => Promise.resolve()),
    ).rejects.toBeInstanceOf(TypeError)
  })
})
