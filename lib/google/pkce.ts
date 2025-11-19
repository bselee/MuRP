/**
 * PKCE (Proof Key for Code Exchange) helpers
 * For secure OAuth flows in browser-based apps
 */

/**
 * Generate cryptographically secure random string
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate code verifier (base64url encoded random string)
 */
export function generateCodeVerifier(): string {
  const randomString = generateRandomString(32);
  return base64UrlEncode(randomString);
}

/**
 * Generate code challenge from verifier (SHA-256 hash)
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(Array.from(new Uint8Array(hash)).map(b => String.fromCharCode(b)).join(''));
}

/**
 * Base64URL encode (without padding)
 */
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate random state parameter for CSRF protection
 */
export function generateState(): string {
  return generateRandomString(16);
}
