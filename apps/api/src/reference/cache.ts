import type { EngineError, EngineResult } from "@trs/engine-client"
import { LRUCache } from "lru-cache"

/** An engine call that failed; never cached, so the next request asks the engine again. */
export class EngineFailure extends Error {
  override name = "EngineFailure"
  constructor(readonly error: EngineError) {
    super(`engine call failed: ${error.kind}`)
  }
}

type Loader = () => Promise<EngineResult<unknown>>

export interface ReferenceCacheOptions {
  ttlMs: number
  /** Entries kept; the least recently used is dropped first. */
  max?: number
}

/**
 * In-process LRU with TTL in front of the engines. Concurrent misses of one key share a single
 * engine call (request coalescing, built into `LRUCache.fetch`). Failures are not cached.
 */
export class ReferenceCache {
  private readonly lru: LRUCache<string, { value: unknown }, Loader>

  constructor({ ttlMs, max = 500 }: ReferenceCacheOptions) {
    this.lru = new LRUCache<string, { value: unknown }, Loader>({
      max,
      ttl: ttlMs,
      fetchMethod: async (_key, _stale, { context }) => {
        const result = await context()
        if (!result.ok) throw new EngineFailure(result.error)
        return { value: result.value }
      },
    })
  }

  /** The cached value of `key`, or the loader's value (stored on success). */
  async get<T>(key: string, load: () => Promise<EngineResult<T>>, ttlMs?: number): Promise<T> {
    const entry = await this.lru.fetch(key, {
      context: load,
      ...(ttlMs === undefined ? {} : { ttl: ttlMs }),
    })
    if (entry === undefined) throw new Error("the cache returned no value")
    return entry.value as T
  }
}

/** Stable key part for a set of parameters: sorted keys, trimmed text. */
export function cacheKey(parts: Record<string, string | number>): string {
  return Object.keys(parts)
    .sort()
    .map((name) => `${name}=${String(parts[name]).trim()}`)
    .join("&")
}
