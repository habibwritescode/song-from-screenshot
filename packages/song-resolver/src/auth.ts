// Hashing first gives equal-length inputs, which timingSafeEqual requires.
export async function isAuthorized(
  header: string | undefined,
  token: string,
): Promise<boolean> {
  if (!token || !header?.startsWith("Bearer ")) return false;
  const [given, expected] = await Promise.all([
    sha256(header.slice("Bearer ".length)),
    sha256(token),
  ]);
  return crypto.subtle.timingSafeEqual(given, expected);
}

function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}
