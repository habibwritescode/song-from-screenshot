/**
 * The link that sets up the phone web app in one tap. The token goes after
 * the #, which browsers never send to the server; the page reads it and
 * removes it from the address bar and history.
 */
export function phoneSetupLink(workerUrl: string, token: string): string {
  return `${workerUrl.replace(/\/+$/, "")}/#token=${encodeURIComponent(token)}`;
}
