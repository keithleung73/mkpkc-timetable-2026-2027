/** GitHub Pages 用：課表加密後才上庫，完整連結（#k=）先解得開。 */

export const ACCESS_PARAM = "k";
export const ACCESS_STORAGE_KEY = "mkpkc.siteAccess.v1";
export const PBKDF2_ITERATIONS = 210_000;

export type EncryptedBlob = {
  v: 1;
  alg: "AES-GCM";
  kdf: "PBKDF2";
  hash: "SHA-256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
};

export class SiteAccessError extends Error {
  constructor(
    message: string,
    readonly code: "missing" | "invalid" | "corrupt",
  ) {
    super(message);
    this.name = "SiteAccessError";
  }
}

export function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    v.alg === "AES-GCM" &&
    typeof v.salt === "string" &&
    typeof v.iv === "string" &&
    typeof v.ct === "string" &&
    typeof v.iter === "number"
  );
}

export function randomAccessKey(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `mkpkc-${bytesToB64Url(bytes)}`;
}

export function githubPagesUnlockUrl(origin: string, code: string): string {
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  return `${base}#${ACCESS_PARAM}=${encodeURIComponent(code)}`;
}

export function readStoredAccessCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(ACCESS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function captureAccessCodeFromLocation(loc = window.location): string | null {
  const hashParams = new URLSearchParams(loc.hash.replace(/^#/, ""));
  const fromHash = hashParams.get(ACCESS_PARAM)?.trim();
  if (fromHash) return fromHash;

  const fromQuery = new URLSearchParams(loc.search).get(ACCESS_PARAM)?.trim();
  if (fromQuery) return fromQuery;

  return readStoredAccessCode();
}

export function persistAccessCode(code: string) {
  const trimmed = code.trim();
  if (!trimmed || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ACCESS_STORAGE_KEY, trimmed);
  } catch {
    /* ignore quota / private mode */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(ACCESS_PARAM);
  url.hash = `${ACCESS_PARAM}=${encodeURIComponent(trimmed)}`;
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function clearAccessCode() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ACCESS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(ACCESS_PARAM);
  url.hash = "";
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export async function encryptUtf8(plain: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const encoded = new TextEncoder().encode(plain);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBuf(iv) }, key, encoded);
  return {
    v: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2",
    hash: "SHA-256",
    iter: PBKDF2_ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ctBuf)),
  };
}

export async function decryptUtf8(blob: EncryptedBlob, passphrase: string): Promise<string> {
  if (!isEncryptedBlob(blob) || blob.iter < 100_000) {
    throw new SiteAccessError("加密課表檔案損壞。", "corrupt");
  }
  try {
    const salt = b64ToBytes(blob.salt);
    const iv = b64ToBytes(blob.iv);
    const ct = b64ToBytes(blob.ct);
    const key = await deriveKey(passphrase, salt, blob.iter);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf(iv) }, key, ct);
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new SiteAccessError("呢條連結無效。請向學務發展部重新索取開啟連結。", "invalid");
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array, iter: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: ivBuf(salt), iterations: iter, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function ivBuf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function bytesToB64Url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
