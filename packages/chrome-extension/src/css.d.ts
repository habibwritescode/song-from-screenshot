// esbuild's text loader bundles .css imports as strings.
declare module "*.css" {
  const css: string;
  export default css;
}
