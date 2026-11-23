import { readFile } from "node:fs/promises"
import { vi, type Mock } from "vitest"

type FetchMock = Mock<(request: Request) => Promise<Response>>

/** Reads a JSON file relative to this folder (recorded responses, the shared engine fixtures). */
export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as unknown
}

export function jsonResponse(
  body: unknown,
  status = 200,
  contentType = "application/json",
): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": contentType } })
}

/** A fetch mock that answers every request with the responses given, in order. */
export function mockFetch(...responses: (Response | Error)[]): FetchMock {
  return vi.fn((_request: Request): Promise<Response> => {
    const next = responses.shift()
    if (!next) return Promise.reject(new Error("no more mocked responses"))
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  })
}

/** A fetch that never answers, until the request is aborted (as the real fetch does). */
export function hangingFetch(): FetchMock {
  return vi.fn(
    (request: Request) =>
      new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason as Error))
      }),
  )
}

export function sentRequest(fetch: FetchMock, index = 0): Request {
  const request = fetch.mock.calls[index]?.[0]
  if (!request) throw new Error(`no request #${index}`)
  return request
}
