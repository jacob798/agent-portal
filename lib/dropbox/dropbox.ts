/**
 * Minimal Dropbox client for the portal (Node runtime only) — refresh-token auth + the team-space
 * path root, so `/Finance/...` resolves to the shared team folder (same as the worker's
 * dropbox_api). Used to drop a copy of each generated expense-report package into the month's
 * Dropbox folder. fetch-based; no SDK.
 */

const TOKEN_URL = "https://api.dropbox.com/oauth2/token";
const RPC = "https://api.dropbox.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

let _token: { value: string; exp: number } | null = null;
let _root: string | null = null;

export function dropboxConfigured(): boolean {
  return !!(process.env.DROPBOX_REFRESH_TOKEN && process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET);
}

async function accessToken(): Promise<string> {
  if (_token && _token.exp > Date.now() + 30_000) return _token.value;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: process.env.DROPBOX_REFRESH_TOKEN!,
    client_id: process.env.DROPBOX_APP_KEY!,
    client_secret: process.env.DROPBOX_APP_SECRET!,
  });
  const r = await fetch(TOKEN_URL, { method: "POST", body });
  if (!r.ok) throw new Error(`dropbox token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  _token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 14400) * 1000 };
  return _token.value;
}

/** The team-space path root header so `/Finance` is the shared team folder (not the member's). */
async function rootHeaders(token: string): Promise<Record<string, string>> {
  const override = process.env.DROPBOX_PATH_ROOT;
  if (override === "0") return {};
  let ns = override && override.trim() ? override.trim() : _root;
  if (!ns) {
    const r = await fetch(`${RPC}/users/get_current_account`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const j = await r.json();
      ns = String(j?.root_info?.root_namespace_id ?? "");
      _root = ns;
    }
  }
  return ns ? { "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "root", root: ns }) } : {};
}

/** Dropbox-API-Arg must be HTTP-header-safe: escape non-ASCII as \uXXXX. */
function headerSafe(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    out += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : ch;
  }
  return out;
}

export async function ensureFolder(path: string): Promise<void> {
  const token = await accessToken();
  const r = await fetch(`${RPC}/files/create_folder_v2`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(await rootHeaders(token)) },
    body: JSON.stringify({ path, autorename: false }),
  });
  if (!r.ok) {
    const txt = await r.text();
    if (!txt.includes("conflict")) throw new Error(`dropbox mkdir ${path}: ${txt.slice(0, 200)}`);
  }
}

/** Size of a Dropbox file in bytes, or null if it doesn't exist. */
export async function fileSize(path: string): Promise<number | null> {
  try {
    const token = await accessToken();
    const r = await fetch(`${RPC}/files/get_metadata`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(await rootHeaders(token)) },
      body: JSON.stringify({ path }),
    });
    if (!r.ok) return null;
    return (await r.json())?.size ?? null;
  } catch {
    return null;
  }
}

async function deleteQuiet(path: string): Promise<void> {
  try {
    const token = await accessToken();
    await fetch(`${RPC}/files/delete_v2`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(await rootHeaders(token)) },
      body: JSON.stringify({ path }),
    });
  } catch {
    /* best-effort */
  }
}

/** Copy a file WITHIN Dropbox (server-side, byte-exact — never re-downloads, so it can't
 *  truncate). Overwrites the destination. Returns the copied file's size for verification. */
export async function copyFile(fromPath: string, toPath: string): Promise<number> {
  const doCopy = async () => {
    const token = await accessToken();
    return fetch(`${RPC}/files/copy_v2`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(await rootHeaders(token)) },
      body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: false }),
    });
  };
  let r = await doCopy();
  if (!r.ok) {
    const txt = await r.text();
    if (txt.includes("conflict")) { await deleteQuiet(toPath); r = await doCopy(); }
    else throw new Error(`dropbox copy ${fromPath}: ${txt.slice(0, 200)}`);
  }
  if (!r.ok) throw new Error(`dropbox copy retry ${fromPath}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())?.metadata?.size ?? 0;
}

export async function uploadFile(path: string, bytes: Uint8Array | Buffer): Promise<void> {
  const token = await accessToken();
  const arg = headerSafe(JSON.stringify({ path, mode: "overwrite", mute: true, autorename: false }));
  const r = await fetch(`${CONTENT}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": arg,
      ...(await rootHeaders(token)),
    },
    body: Buffer.from(bytes),
  });
  if (!r.ok) throw new Error(`dropbox upload ${path}: ${(await r.text()).slice(0, 200)}`);
}
