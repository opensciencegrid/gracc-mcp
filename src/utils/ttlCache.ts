interface CacheEntry {
  value: string;
  bytes: number;
  expiresAt: number;
}

export interface TtlLruCacheOptions {
  ttlMs: number;
  maxBytes: number;
  now?: () => number;
}

/** Small string cache bounded by total UTF-8 bytes, with per-entry TTL and LRU eviction. */
export class TtlLruCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private totalBytes = 0;

  public constructor(options: TtlLruCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxBytes = options.maxBytes;
    this.now = options.now ?? Date.now;
  }

  public get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.remove(key, entry);
      return undefined;
    }

    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  public set(key: string, value: string): void {
    if (this.ttlMs <= 0 || this.maxBytes <= 0) {
      return;
    }

    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > this.maxBytes) {
      return;
    }

    const existing = this.entries.get(key);
    if (existing) {
      this.remove(key, existing);
    }

    this.entries.set(key, { value, bytes, expiresAt: this.now() + this.ttlMs });
    this.totalBytes += bytes;

    for (const [oldestKey, oldest] of this.entries) {
      if (this.totalBytes <= this.maxBytes) {
        break;
      }
      this.remove(oldestKey, oldest);
    }
  }

  private remove(key: string, entry: CacheEntry) {
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
  }
}
