import { describe, expect, it } from "vitest";
import { phoneSetupLink } from "../../scripts/setup-link";
import { readFragment } from "../src/lib/fragment";

describe("phone setup link", () => {
  it.each([
    {
      kind: "the setup script's URL-safe base64",
      token: "q-3_Zx9vW2mK8L-pR4tY_aB7cD1eF5gH0jN6uV3wX2s",
    },
    {
      kind: "openssl's standard base64",
      token: "q+3/Zx9vW2mK8L+pR4tY/aB7cD1eF5gH0jN6uV3wX2s=",
    },
  ])("hands $kind tokens to the web app unchanged", ({ token }) => {
    const link = new URL(
      phoneSetupLink("https://w.example.workers.dev/", token),
    );
    expect(link.origin + link.pathname).toBe("https://w.example.workers.dev/");
    expect(readFragment(link.hash)).toEqual({ kind: "token", token });
  });
});
