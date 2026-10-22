// What this device remembers between rooms.
//
// Three things live in browser storage: the credential that *is* this player
// (`gahookz-client-key`), the name and look they last joined with
// (`gahookz-last-join`), and a room's password — tab-scoped, because a shared
// laptop should not hand the next person the keys to a room.
//
// None of it was typed, none of it was reachable by a test, and all of it is
// data this code did not write. Another version of the app wrote some of it,
// possibly months ago, possibly with a different shape; the person can edit
// any of it; and a browser is free to answer every read with an exception
// because the page is in private mode or site data is blocked.
//
// Measured before this module existed: a saved join whose `name` was the
// number `12345` threw `w.trim is not a function` during render and left a
// **blank page** — no join form, no message, no way back except clearing site
// data. So every value read here is proved to be the string it claims to be
// before it is handed to the app, and anything else is dropped as though it
// had never been stored.
//
// Storage arrives as a provider rather than a reference: each call reaches for
// it afresh, as the inline code did, so a browser that starts refusing (or
// starts allowing) is handled either way, and a test can hand over a fake that
// throws.

/** The slice of `Storage` this module uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageProvider = () => StorageLike | null | undefined;

export const CLIENT_KEY = "gahookz-client-key";
export const JOIN_KEY = "gahookz-last-join";
export const ROOM_PASSWORD_PREFIX = "gahookz-room-password-";

/** Mirrors the server's own limits; the client cannot import them. */
const MAX_NAME_CHARS = 24;
const MAX_SHORT_CHARS = 40;
const MAX_AVATAR_IMAGE_CHARS = 1_500_000;

function read(storage: StorageProvider, key: string): string {
  try {
    return storage()?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(storage: StorageProvider, key: string, value: string): boolean {
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(key, value);
    return true;
  } catch {
    // Full, private, or blocked. A remembered name is a convenience, and
    // losing it must never stop someone joining a game.
    return false;
  }
}

function drop(storage: StorageProvider, key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* nothing to undo */
  }
}

/** Room codes are letters only, four of them, upper case. */
export function normaliseRoomCode(value: unknown): string {
  return String(value || "").replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase();
}

function text(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.slice(0, maxChars) : "";
}

export interface SavedJoin {
  code?: string;
  name?: string;
  avatarId?: string;
  avatarImageDataUrl?: string;
  gahookForm?: string;
}

/**
 * The five fields a saved join may contain, and nothing else.
 *
 * Built field by field rather than by copying the stored object, so a key that
 * is not listed here cannot survive a round trip however it got in — including
 * `password`, which an older version of this app stored durably and which this
 * one must never write back.
 *
 * A picture is only kept if it is a `data:` URL. Anything else is someone
 * else's address: the server refuses it anyway (it stores images as room
 * assets), so keeping one could only ever put a stranger's URL in front of the
 * room.
 */
export function sanitiseJoin(value: unknown): SavedJoin {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const join: SavedJoin = {};
  const code = normaliseRoomCode(raw["code"]);
  if (code) join.code = code;
  const name = text(raw["name"], MAX_NAME_CHARS);
  if (name) join.name = name;
  const avatarId = text(raw["avatarId"], MAX_SHORT_CHARS);
  if (avatarId) join.avatarId = avatarId;
  const picture = text(raw["avatarImageDataUrl"], MAX_AVATAR_IMAGE_CHARS);
  if (picture.startsWith("data:image/")) join.avatarImageDataUrl = picture;
  const gahookForm = text(raw["gahookForm"], MAX_SHORT_CHARS);
  if (gahookForm) join.gahookForm = gahookForm;
  return join;
}

export function readSavedJoin(local: StorageProvider): SavedJoin {
  const stored = read(local, JOIN_KEY);
  if (!stored) return {};
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return {};
  }
  const join = sanitiseJoin(parsed);
  // Rewrite whenever the stored form is not the form this version writes, so a
  // credential or a corrupt field left by an older release is gone from the
  // device rather than merely ignored on the way past.
  if (JSON.stringify(join) !== stored) write(local, JOIN_KEY, JSON.stringify(join));
  return join;
}

export function writeSavedJoin(local: StorageProvider, join: unknown): SavedJoin {
  const safe = sanitiseJoin(join);
  write(local, JOIN_KEY, JSON.stringify(safe));
  return safe;
}

/** Where a credential lives when the browser will not keep it. */
export interface KeyMemory {
  key?: string;
}

/**
 * This device's credential.
 *
 * It is the `playerKey` on every request, so a different answer is a different
 * player. The page therefore asks for it constantly — every command, every
 * render — and that made a browser which refuses to store anything unplayable:
 * each call minted a new identity, so the room never saw the same person
 * twice. Measured on the real client with site data blocked: **1,001 distinct
 * player keys from one tab**, a join that the room accepted, and a screen
 * stuck on "Joining" for ever.
 *
 * So a key that could not be stored is kept in memory for the life of the
 * page. It will not survive a refresh — nothing can, if the browser keeps
 * nothing — but the game is playable, which guest play must always be.
 */
export function readClientKey(local: StorageProvider, createId: () => string, memory: KeyMemory): string {
  const existing = read(local, CLIENT_KEY);
  if (existing) return existing;
  if (memory.key) return memory.key;
  const next = createId();
  memory.key = next;
  write(local, CLIENT_KEY, next);
  return next;
}

export function roomPasswordKey(code: unknown): string {
  return ROOM_PASSWORD_PREFIX + normaliseRoomCode(code);
}

/**
 * A room password, for this tab only.
 *
 * `sessionStorage`, never `localStorage`: a password typed on a shared or
 * borrowed device should not outlive the tab it was typed in.
 */
export function readRoomPassword(session: StorageProvider, code: unknown): string {
  return normaliseRoomCode(code) ? read(session, roomPasswordKey(code)) : "";
}

export function writeRoomPassword(session: StorageProvider, code: unknown, password: unknown): void {
  if (!normaliseRoomCode(code)) return;
  const value = typeof password === "string" ? password : "";
  if (value) write(session, roomPasswordKey(code), value);
  else drop(session, roomPasswordKey(code));
}

export interface UrlPassword {
  /** The password the link carried, if any. */
  readonly password: string;
  /** The room `?room=` named, if it did. The caller adds the route's own. */
  readonly code: string;
  /** The same address with the password removed. */
  readonly href: string;
}

/**
 * Read a password out of a link, once.
 *
 * Old versions of Gahookz wrote room links as `/?room=CODE&pwd=SECRET`, and
 * those links are still in people's messages. A password in an address bar is
 * in the history, the referrer and anything that reads a shared screen, so it
 * is taken out of the URL immediately — the caller replaces the address with
 * `href`.
 */
export function readUrlPassword(href: string): UrlPassword {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { password: "", code: "", href };
  }
  const password = url.searchParams.get("pwd") || url.searchParams.get("pw") || "";
  url.searchParams.delete("pwd");
  url.searchParams.delete("pw");
  // Only `?room=` is read here. A room code in the path is the router's
  // business — `/host/ABCD` and `/ABCD/player` are both room ABCD — and
  // guessing it a second way is how the two readings drift apart.
  const code = normaliseRoomCode(url.searchParams.get("room"));
  return { password, code, href: url.pathname + url.search + url.hash };
}

/**
 * The link's password, but only for the room the link was for.
 *
 * Without this, a password that arrived for one room was offered to every room
 * this tab visited afterwards. A link that names no room keeps the old
 * behaviour, because there is nothing to disagree with.
 */
export function urlPasswordFor(captured: UrlPassword | null, code: unknown): string {
  if (!captured?.password) return "";
  if (!captured.code) return captured.password;
  return captured.code === normaliseRoomCode(code) ? captured.password : "";
}
