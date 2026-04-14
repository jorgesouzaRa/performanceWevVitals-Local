import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PagespeedApiRawResponse } from "./types.js";

export type CacheKeyInput = {
  url: string;
  strategy: "mobile" | "desktop";
  categories: string[];
  locale?: string;
};

export function requestCacheHash(input: CacheKeyInput): string {
  const categories = [...input.categories].sort();
  const payload = JSON.stringify({
    u: input.url,
    s: input.strategy,
    c: categories,
    l: input.locale ?? "",
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function readCacheFile(
  cacheDirAbs: string,
  hash: string
): PagespeedApiRawResponse | null {
  const p = join(cacheDirAbs, `${hash}.json`);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as PagespeedApiRawResponse;
    if (raw && typeof raw === "object") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeCacheFile(
  cacheDirAbs: string,
  hash: string,
  json: PagespeedApiRawResponse
): void {
  mkdirSync(cacheDirAbs, { recursive: true });
  const p = join(cacheDirAbs, `${hash}.json`);
  writeFileSync(p, JSON.stringify(json), "utf-8");
}
