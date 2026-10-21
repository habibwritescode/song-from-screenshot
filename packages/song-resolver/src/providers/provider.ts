import type { Env } from "../env";
import type { Candidate, SongText } from "../types";

export interface ProviderContext {
  env: Env;
  fetch: typeof fetch;
  signal: AbortSignal;
}

export interface Provider {
  name: string;
  /** Core providers decide the status; if every core provider fails, the lookup fails. */
  core: boolean;
  isEnabled(env: Env): boolean;
  search(song: SongText, ctx: ProviderContext): Promise<Candidate[]>;
}

export class ProviderError extends Error {
  override readonly name = "ProviderError";
}

export async function getJson(
  url: URL,
  ctx: ProviderContext,
  provider: string,
  headers?: HeadersInit,
): Promise<unknown> {
  const res = await ctx.fetch(url, { signal: ctx.signal, headers });
  if (!res.ok)
    throw new ProviderError(`${provider} returned HTTP ${res.status}`);
  return res.json();
}
