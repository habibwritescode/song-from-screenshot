import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import pkg from "../package.json";
import { isAuthorized } from "./auth";
import { createCache } from "./cache";
import type { Env } from "./env";
import { ExtractError, type MessagesClient } from "./extract";
import { sniffImageType } from "./image";
import { LookupError } from "./lookup";
import { deezer } from "./providers/deezer";
import { itunes } from "./providers/itunes";
import { spotify } from "./providers/spotify";
import { youtube } from "./providers/youtube";
import { resolveScreenshot } from "./resolve";
import type { ErrorCode, ErrorResponse, ResolveResponse } from "./types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const PROVIDER_TIMEOUT_MS = 4000;
const PROVIDERS = [itunes, spotify, deezer, youtube];

export interface AppDeps {
  makeClient(env: Env): MessagesClient;
  fetch: typeof fetch;
}

const defaultDeps: AppDeps = {
  makeClient: (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  // Calling the global fetch detached from its receiver throws "Illegal invocation" in Workers.
  fetch: (input, init) => fetch(input, init),
};

const tooLarge = () =>
  new ApiError(413, "image_too_large", "Images must be 5 MB or smaller");

class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function createApp(deps: AppDeps = defaultDeps) {
  const app = new Hono<{ Bindings: Env }>();

  app.use(
    "/api/*",
    cors({
      origin: (origin) =>
        origin.startsWith("chrome-extension://") ? origin : null,
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.get("/api/health", (c) => c.json({ ok: true, version: pkg.version }));

  // The web app's service worker answers Android's share target itself. This
  // only runs before it's installed (first visit, or site data cleared).
  app.post("/share", (c) => c.redirect("/?share=unavailable", 303));

  app.post("/api/resolve", async (c) => {
    if (
      !(await isAuthorized(c.req.header("Authorization"), c.env.ACCESS_TOKEN))
    ) {
      throw new ApiError(
        401,
        "unauthorized",
        "Missing or invalid access token",
      );
    }

    // parseBody() reads the whole upload into memory, so refuse declared
    // oversize bodies before it does.
    const declared = Number(c.req.header("Content-Length"));
    if (declared > MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES) {
      throw tooLarge();
    }

    const { image } = await c.req.parseBody();
    if (!(image instanceof File)) {
      throw new ApiError(
        400,
        "missing_image",
        'Send the screenshot as a multipart "image" field',
      );
    }
    if (image.size > MAX_IMAGE_BYTES) {
      throw tooLarge();
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    const mediaType = sniffImageType(bytes);
    if (!mediaType)
      throw new ApiError(
        415,
        "unsupported_type",
        "Send a PNG, JPEG or WebP image",
      );

    const response = await resolveScreenshot(bytes, mediaType, {
      env: c.env,
      client: deps.makeClient(c.env),
      fetch: deps.fetch,
      cache: createCache(c.env.CACHE),
      providers: PROVIDERS,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      defer: (work) => c.executionCtx.waitUntil(work),
    });
    return c.json<ResolveResponse>(response);
  });

  app.onError((err, c) => {
    if (err instanceof ApiError)
      return c.json<ErrorResponse>(
        errorBody(err.code, err.message),
        err.status,
      );
    if (
      err instanceof ExtractError ||
      err instanceof LookupError ||
      err instanceof Anthropic.APIError
    ) {
      console.error("upstream error:", err.name, err.message);
      return c.json<ErrorResponse>(
        errorBody(
          "upstream_error",
          "A service this depends on failed; try again",
        ),
        502,
      );
    }
    console.error("unexpected error:", err);
    return c.json<ErrorResponse>(
      errorBody("internal_error", "Something went wrong"),
      500,
    );
  });

  return app;
}

function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

export default createApp();
