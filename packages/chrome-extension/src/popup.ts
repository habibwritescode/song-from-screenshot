import { createHistory } from "./lib/history";
import { isConfigured, loadSettings } from "./lib/settings";
import { renderHistory } from "./ui/history-list";

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`popup.html is missing #${id}`);
  return element as T;
}

const content = $<HTMLElement>("content");
const clear = $<HTMLButtonElement>("clear");
const history = createHistory(chrome.storage.local);

function openOptions() {
  void chrome.runtime.openOptionsPage();
  window.close();
}

async function show() {
  const [settings, entries] = await Promise.all([
    loadSettings(chrome.storage.local),
    history.load(),
  ]);
  if (!isConfigured(settings)) {
    const setup = document.createElement("button");
    setup.type = "button";
    setup.className = "setup";
    setup.textContent = "Set up";
    setup.addEventListener("click", openOptions);
    const lede = document.createElement("p");
    lede.className = "empty";
    lede.textContent = "Connect the extension to your song-resolver Worker.";
    content.replaceChildren(lede, setup);
    clear.hidden = true;
    return;
  }
  content.replaceChildren(
    renderHistory(entries, settings.preferredPlatform, Date.now()),
  );
  clear.hidden = entries.length === 0;
}

function showError() {
  const message = document.createElement("p");
  message.className = "empty";
  message.textContent = "Couldn't load your history. Close and reopen this.";
  content.replaceChildren(message);
  clear.hidden = true;
}

$<HTMLButtonElement>("settings").addEventListener("click", openOptions);
clear.addEventListener("click", () => {
  void history.clear().then(show).catch(showError);
});
show().catch(showError);
