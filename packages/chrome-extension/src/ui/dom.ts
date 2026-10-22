import { isWebUrl, type LinkButton } from "../lib/links";

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children.filter((child) => child !== null));
  return element;
}

export function linkAnchor({ label, url }: LinkButton): HTMLAnchorElement {
  return el(
    "a",
    { href: url, target: "_blank", rel: "noopener noreferrer" },
    label,
    el("span", { className: "arrow", ariaHidden: "true" }, "↗"),
  );
}

/** Every link shown comes from the Worker, so only web URLs pass. */
export function linkList(links: LinkButton[]): HTMLElement {
  return el(
    "ul",
    { className: "links" },
    ...links
      .filter(({ url }) => isWebUrl(url))
      .map((link) => el("li", {}, linkAnchor(link))),
  );
}
