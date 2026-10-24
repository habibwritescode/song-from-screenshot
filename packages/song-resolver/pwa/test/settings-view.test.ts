import { describe, expect, it, vi } from "vitest";
import type { ConnectionResult } from "../../client/api";
import { DEFAULT_SETTINGS, type Settings } from "../src/lib/settings";
import { renderSettings, renderSetup } from "../src/ui/settings";

const saved: Settings = {
  token: "old-token",
  preferredPlatform: "appleMusic",
  openDirectly: false,
};

function settingsView(test: ConnectionResult = { kind: "ok", version: "1" }) {
  const onSave = vi.fn<(settings: Settings) => boolean>(() => true);
  const onTest = vi.fn<(token: string) => Promise<ConnectionResult>>(
    async () => test,
  );
  const onClearHistory = vi.fn(async () => undefined);
  const view = renderSettings(saved, { onSave, onTest, onClearHistory });
  const $ = <T extends HTMLElement>(selector: string) =>
    view.querySelector(selector) as T;
  return { view, onSave, onTest, onClearHistory, $ };
}

describe("settings view", () => {
  it("shows what's saved", () => {
    const { $ } = settingsView();
    expect($<HTMLInputElement>("#token").value).toBe("old-token");
    expect($<HTMLSelectElement>("#preferred").value).toBe("appleMusic");
    expect($<HTMLInputElement>("#open-directly").checked).toBe(false);
  });

  it("saves the edited values, token trimmed", () => {
    const { $, onSave } = settingsView();
    $<HTMLInputElement>("#token").value = "  new-token \n";
    $<HTMLSelectElement>("#preferred").value = "deezer";
    $<HTMLInputElement>("#open-directly").checked = true;
    $<HTMLFormElement>("form").requestSubmit();
    expect(onSave).toHaveBeenCalledWith({
      token: "new-token",
      preferredPlatform: "deezer",
      openDirectly: true,
    });
  });

  it("won't save without a token", () => {
    const { $, onSave } = settingsView();
    $<HTMLInputElement>("#token").value = " ";
    $<HTMLFormElement>("form").requestSubmit();
    expect(onSave).not.toHaveBeenCalled();
    expect($("[role=alert]").textContent).not.toBe("");
  });

  it("tests the token typed in, not the saved one", async () => {
    const { $, onTest } = settingsView();
    $<HTMLInputElement>("#token").value = "typed";
    $<HTMLButtonElement>("[data-action=test]").click();
    await vi.waitFor(() => expect(onTest).toHaveBeenCalledWith("typed"));
  });

  it.each([
    [{ kind: "ok", version: "1" }, "ok"],
    [{ kind: "bad_token", version: "1" }, "bad"],
    [{ kind: "unreachable" }, "bad"],
  ] as const)("reports a %o test as %s", async (result, mark) => {
    const { $ } = settingsView(result);
    $<HTMLButtonElement>("[data-action=test]").click();
    await vi.waitFor(() =>
      expect($("[role=status]").dataset.result).toBe(mark),
    );
  });

  it("clears the history when asked", async () => {
    const { $, onClearHistory } = settingsView();
    $<HTMLButtonElement>("[data-action=clear-history]").click();
    expect(onClearHistory).toHaveBeenCalled();
  });

  it("shows and hides the token", () => {
    const { $ } = settingsView();
    const token = $<HTMLInputElement>("#token");
    expect(token.type).toBe("password");
    $<HTMLButtonElement>("[data-action=reveal]").click();
    expect(token.type).toBe("text");
  });
});

describe("setup view", () => {
  it("saves a pasted token with the default preferences", () => {
    const onSave = vi.fn(() => true);
    const view = renderSetup({ onSave });
    (view.querySelector("#token") as HTMLInputElement).value = "pasted";
    (view.querySelector("form") as HTMLFormElement).requestSubmit();
    expect(onSave).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      token: "pasted",
    });
  });

  it("says so when the browser won't keep it", () => {
    const view = renderSetup({ onSave: () => false });
    (view.querySelector("#token") as HTMLInputElement).value = "pasted";
    (view.querySelector("form") as HTMLFormElement).requestSubmit();
    expect(view.querySelector("[role=alert]")?.textContent).toMatch(/private/i);
  });
});
