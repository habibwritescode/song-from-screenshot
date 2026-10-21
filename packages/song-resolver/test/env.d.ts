import type { Env as WorkerEnv } from "../src/env";

declare global {
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges our Env into the test runtime's `env`
    interface Env extends WorkerEnv {}
  }
}
