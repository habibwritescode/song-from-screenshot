import type { Env } from "./env";
import { isMatch } from "./match";
import { ProviderError, type Provider } from "./providers/provider";
import type { Candidate, Links, SongText, Status, Track } from "./types";

export interface LookupResult {
  status: Status;
  track: Track | null;
  links: Links;
  partial: boolean;
}

export class LookupError extends Error {
  override readonly name = "LookupError";
}

interface ProviderOutcome {
  provider: Provider;
  candidates: Candidate[];
  match: Candidate | undefined;
}

/** `providers` order sets the track's source when several match (e.g. iTunes before Deezer for its artwork). */
export async function lookup(
  song: SongText,
  providers: Provider[],
  deps: { env: Env; fetch: typeof fetch; timeoutMs: number },
): Promise<LookupResult> {
  const enabled = providers.filter((p) => p.isEnabled(deps.env));
  const settled = await Promise.allSettled(
    enabled.map((provider) =>
      withTimeout(
        (signal) =>
          provider.search(song, { env: deps.env, fetch: deps.fetch, signal }),
        deps.timeoutMs,
        provider.name,
      ),
    ),
  );

  const outcomes: ProviderOutcome[] = [];
  settled.forEach((result, i) => {
    const provider = enabled[i];
    if (!provider) return;
    if (result.status === "fulfilled") {
      outcomes.push({
        provider,
        candidates: result.value,
        match: result.value.find((c) => isMatch(song, c)),
      });
    } else {
      const reason: unknown = result.reason;
      console.error(
        `${provider.name} failed:`,
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  });

  const partial = outcomes.length < enabled.length;
  const coreEnabled = enabled.some((p) => p.core);
  const core = outcomes.filter((o) => o.provider.core);
  if (coreEnabled && core.length === 0)
    throw new LookupError("Every core provider failed");

  const firstMatch = core.find((o) => o.match)?.match;
  if (firstMatch) {
    const links: Links = {};
    for (const o of outcomes) Object.assign(links, o.match?.links);
    return { status: "matched", track: toTrack(firstMatch), links, partial };
  }

  const best =
    firstMatch ?? core.find((o) => o.candidates.length > 0)?.candidates[0];
  return best
    ? { status: "uncertain", track: toTrack(best), links: {}, partial }
    : { status: "not_found", track: null, links: {}, partial };
}

function toTrack(c: Candidate): Track {
  return {
    title: c.title,
    artist: c.artist,
    album: c.album ?? null,
    artworkUrl: c.artworkUrl ?? null,
  };
}

// Rejects on timeout even if the provider ignores the abort signal.
function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  name: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(new ProviderError(`${name} timed out after ${ms}ms`)),
    ms,
  );
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () =>
      reject(controller.signal.reason),
    );
  });
  return Promise.race([run(controller.signal), aborted]).finally(() =>
    clearTimeout(timer),
  );
}
