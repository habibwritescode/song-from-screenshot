/// <reference types="node" />
import { context, build, type BuildOptions } from "esbuild";
import { cp, mkdir, readFile, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const STATIC = ["manifest.json", "icons", "src/options.html", "src/popup.html"];

const common: BuildOptions = {
  bundle: true,
  outdir,
  target: "chrome116",
  logLevel: "info",
  loader: { ".css": "text" },
  sourcemap: watch ? "inline" : false,
};

// Content, options and popup scripts load as classic scripts; only the
// service worker is declared as a module in the manifest.
const builds: BuildOptions[] = [
  { ...common, entryPoints: ["src/background.ts"], format: "esm" },
  {
    ...common,
    entryPoints: ["src/content.ts", "src/options.ts", "src/popup.ts"],
    format: "iife",
  },
];

async function copyStatic() {
  for (const path of STATIC) {
    const name = path.replace(/^src\//, "");
    await cp(path, `${outdir}/${name}`, {
      recursive: true,
      // Icon sources stay in the repo; Chrome only reads the PNGs.
      filter: (source) => !source.endsWith(".svg"),
    });
  }
}

// The release tag is checked against package.json, and Chrome reads the
// manifest, so a mismatch would ship a zip that reports the wrong version.
const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as { version: string };
const [pkg, manifest] = await Promise.all([
  readJson("package.json"),
  readJson("manifest.json"),
]);
if (pkg.version !== manifest.version) {
  throw new Error(
    `manifest.json version ${manifest.version} doesn't match package.json ${pkg.version}`,
  );
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir);
await copyStatic();

if (watch) {
  for (const options of builds) await (await context(options)).watch();
  console.log(
    "Watching src/. Static files are copied once; restart after changing them.",
  );
} else {
  await Promise.all(builds.map((options) => build(options)));
}
