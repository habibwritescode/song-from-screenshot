// Builds the web app into pwa/dist, which the Worker serves as static assets.
// Plain JavaScript, not TypeScript: wrangler runs this on every deploy,
// including Deploy-button copies on Cloudflare's build machines.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const here = import.meta.dirname;
const src = join(here, "src");
const outdir = join(here, "dist");

const STATIC = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "_headers",
  "icons",
];

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir);
for (const name of STATIC) {
  await cp(join(src, name), join(outdir, name), {
    recursive: true,
    // Icon sources stay in the repo; browsers only read the PNGs.
    filter: (source) => !source.endsWith(".svg"),
  });
}

await build({
  entryPoints: [join(src, "app.ts"), join(src, "sw.ts")],
  bundle: true,
  outdir,
  format: "iife",
  target: ["chrome111", "safari16"],
  minify: true,
  logLevel: "warning",
});
