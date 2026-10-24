// Interactive setup: deploys the Worker (Wrangler creates the KV namespace),
// asks for keys, and stores them as Worker secrets. Safe to re-run: it asks
// before replacing a secret that is already set.
//
//   npm run setup -w song-resolver [-- --name my-worker]
//
// When stdin isn't a terminal, answers are read one per line (used to test it).

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { phoneSetupLink } from "./setup-link.ts";

interface SecretPrompt {
  name: string;
  label: string;
  required?: boolean;
}

const CLAUDE: SecretPrompt = {
  name: "ANTHROPIC_API_KEY",
  label: "Claude API key (platform.claude.com → API keys)",
  required: true,
};
const SPOTIFY: SecretPrompt[] = [
  {
    name: "SPOTIFY_CLIENT_ID",
    label: "Spotify Client ID (developer.spotify.com/dashboard; Enter to skip)",
  },
  { name: "SPOTIFY_CLIENT_SECRET", label: "Spotify Client secret" },
];
const OPTIONAL: SecretPrompt[] = [
  {
    name: "YOUTUBE_API_KEY",
    label: "YouTube Data API v3 key (optional; Enter to skip)",
  },
];

const nameFlag = process.argv.indexOf("--name");
const workerArgs =
  nameFlag === -1 ? [] : ["--name", process.argv[nameFlag + 1] ?? ""];
const piped = process.stdin.isTTY
  ? null
  : readFileSync(0, "utf8").split(/\r?\n/);

function wrangler(
  args: string[],
  opts: { input?: string; quiet?: boolean } = {},
) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    input: opts.input,
    encoding: "utf8",
    stdio: [opts.input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
  });
  if (!opts.quiet) process.stdout.write(result.stdout);
  return {
    ok: result.status === 0,
    stdout: result.stdout,
    out: result.stdout + result.stderr,
  };
}

async function ask(question: string, hidden = false): Promise<string> {
  if (piped) {
    const answer = piped.shift() ?? "";
    console.log(question + (hidden && answer ? " ********" : ` ${answer}`));
    return answer.trim();
  }
  process.stdout.write(`${question} `);
  const rl = createInterface({
    input: process.stdin,
    output: hidden
      ? new Writable({ write: (_chunk, _enc, done) => done() })
      : process.stdout,
    terminal: true,
  });
  const answer = await rl.question("");
  rl.close();
  if (hidden) process.stdout.write("\n");
  return answer.trim();
}

async function yes(question: string, defaultYes: boolean): Promise<boolean> {
  const answer = (
    await ask(`${question} ${defaultYes ? "[Y/n]" : "[y/N]"}`)
  ).toLowerCase();
  return answer === "" ? defaultYes : answer.startsWith("y");
}

async function collect(
  prompt: SecretPrompt,
  existing: Set<string>,
): Promise<string | null> {
  if (existing.has(prompt.name)) {
    const replace = await yes(
      `${prompt.name} is already set. Replace it?`,
      false,
    );
    if (!replace) return null;
  }
  for (;;) {
    const value = await ask(`${prompt.label}:`, true);
    if (value || !prompt.required) return value || null;
    if (piped && piped.length === 0)
      throw new Error(`${prompt.name} is required`);
    console.log(`${prompt.name} is required.`);
  }
}

async function main() {
  if (
    !wrangler(["whoami"], { quiet: true }).out.includes("You are logged in")
  ) {
    console.log("Log in to Cloudflare in the browser window that opens.");
    const login = spawnSync("npx", ["wrangler", "login"], { stdio: "inherit" });
    if (login.status !== 0) throw new Error("wrangler login failed");
  }

  console.log("\nDeploying the Worker (creates the KV cache on first run)…");
  const deploy = wrangler(["deploy", ...workerArgs]);
  if (!deploy.ok) throw new Error(`wrangler deploy failed:\n${deploy.out}`);
  const url = deploy.out.match(/https:\/\/\S+\.workers\.dev/)?.[0];

  const list = wrangler(["secret", "list", "--format", "json", ...workerArgs], {
    quiet: true,
  });
  const existing = new Set<string>(
    list.ok
      ? (
          JSON.parse(list.stdout) as {
            name: string;
          }[]
        ).map((s) => s.name)
      : [],
  );

  const secrets: Record<string, string> = {};
  const set = (name: string, value: string | null) => {
    if (value) secrets[name] = value;
  };

  console.log("");
  set(CLAUDE.name, await collect(CLAUDE, existing));

  const [spotifyId, spotifySecret] = SPOTIFY as [SecretPrompt, SecretPrompt];
  const id = await collect(spotifyId, existing);
  if (id) {
    const secret = await collect(
      { ...spotifySecret, required: !existing.has(spotifySecret.name) },
      existing,
    );
    set(spotifyId.name, id);
    set(spotifySecret.name, secret);
  } else if (!existing.has(spotifyId.name)) {
    console.log(
      "No Spotify keys: responses will carry a Spotify search link instead.",
    );
  }

  for (const prompt of OPTIONAL)
    set(prompt.name, await collect(prompt, existing));

  let newToken: string | null = null;
  if (
    !existing.has("ACCESS_TOKEN") ||
    !(await yes(
      "An access token is already set (it can't be shown again). Keep it?",
      true,
    ))
  ) {
    newToken = randomBytes(32).toString("base64url");
    secrets.ACCESS_TOKEN = newToken;
  }

  if (Object.keys(secrets).length > 0) {
    console.log(`\nSaving ${Object.keys(secrets).join(", ")}…`);
    const bulk = wrangler(["secret", "bulk", ...workerArgs], {
      input: JSON.stringify(secrets),
      quiet: true,
    });
    if (!bulk.ok)
      throw new Error("Saving secrets failed (wrangler secret bulk)");
  }

  console.log(`\nDone. Your Worker: ${url ?? "(see the deploy output above)"}`);
  if (newToken) {
    console.log(
      `\nAccess token (shown once; save it in your password manager and in the apps):\n\n  ${newToken}\n`,
    );
    if (url) {
      console.log(
        `Phone app: open this on your phone to set it up in one tap (it contains the token, so don't share it):\n\n  ${phoneSetupLink(url, newToken)}\n`,
      );
    }
  } else if (url) {
    console.log(
      `\nPhone app: open ${url}/#token=<your token> on your phone to set it up in one tap.\n`,
    );
  }
  console.log(
    `${Object.keys(secrets).length > 0 ? "New secrets take about 15 seconds to go live; until then requests get 401.\n" : ""}Try it:\n  curl -H "Authorization: Bearer <token>" -F image=@fixtures/spotify-x-feed.png ${url ?? "https://<worker>"}/api/resolve`,
  );
}

main().catch((err: unknown) => {
  console.error(
    `\nSetup failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
