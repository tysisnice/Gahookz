import crypto from "node:crypto";
import fs from "node:fs/promises";
import { addCareerStats, emptyCareerStats, normaliseCareerStats } from "../../packages/accounts/src/index.ts";

const SESSION_DAYS = 30;
const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const SESSION_CACHE_MS = 60_000;
const OAUTH_FLOW_MS = 10 * 60 * 1000;
const MAX_OAUTH_FLOWS = 2_000;
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const MIGRATION_URL = new URL("../../infra/postgres/001_accounts.sql", import.meta.url);

let googleJwksCache = { expiresAt: 0, keys: [] };

export async function createAccountService(options = {}) {
  const environment = String(options.environment || process.env.NODE_ENV || "development");
  const databaseUrl = String(options.databaseUrl ?? process.env.DATABASE_URL ?? "").trim();
  const publicOrigin = validatePublicOrigin(options.publicOrigin ?? process.env.GAHOOKZ_PUBLIC_ORIGIN ?? "");
  const googleClientId = String(options.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const googleClientSecret = String(options.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const secureCookies = options.secureCookies ?? (process.env.GAHOOKZ_HTTPS === "1" || publicOrigin.startsWith("https://"));
  const logger = options.logger || console;
  let repository = options.repository || createMemoryAccountRepository();
  let persistence = options.persistence || "memory";

  if (databaseUrl && !options.repository) {
    try {
      repository = await createPostgresAccountRepository({
        databaseUrl,
        ssl: options.databaseSsl ?? process.env.GAHOOKZ_DATABASE_SSL === "1",
        autoMigrate: options.autoMigrate ?? process.env.GAHOOKZ_AUTO_MIGRATE !== "0"
      });
      persistence = "postgres";
    } catch (error) {
      if (environment === "production") throw error;
      logger.warn?.("PostgreSQL accounts are unavailable; using an ephemeral development repository.", error?.message || error);
    }
  }

  const googleConfigured = Boolean(publicOrigin && googleClientId && googleClientSecret);
  const googleAvailable = googleConfigured && (persistence === "postgres" || environment !== "production");
  const cookieName = secureCookies ? "__Host-gahookz_session" : "gahookz_session";
  const oauthCookieName = secureCookies ? "__Host-gahookz_oauth" : "gahookz_oauth";
  const oauthFlows = new Map();
  const sessionCache = new Map();

  function invalidateAccount(accountId) {
    for (const [hash, cached] of sessionCache) {
      if (cached.account?.id === accountId) sessionCache.delete(hash);
    }
  }

  async function authenticate(req) {
    const cookies = parseCookies(req?.headers?.cookie);
    const token = cookies[cookieName] || cookies.gahookz_session || cookies["__Host-gahookz_session"] || "";
    if (!isSessionToken(token)) return null;
    const tokenHash = hashToken(token);
    const cached = sessionCache.get(tokenHash);
    if (cached && cached.refreshAt > Date.now()) return cached.account;
    const account = await repository.getSessionAccount(tokenHash, Date.now());
    if (!account) {
      sessionCache.delete(tokenHash);
      return null;
    }
    sessionCache.set(tokenHash, { account, refreshAt: Date.now() + SESSION_CACHE_MS });
    return account;
  }

  function publicStatus(account = null) {
    return {
      ok: true,
      signedIn: Boolean(account),
      googleAvailable,
      persistence,
      account: account ? publicAccount(account) : null
    };
  }

  function beginGoogleLogin(returnTo = "/") {
    if (!googleAvailable) {
      const error = new Error("Google sign-in is not configured on this server.");
      error.statusCode = 503;
      error.code = "login_unavailable";
      throw error;
    }
    pruneOAuthFlows(oauthFlows);
    const state = randomToken(32);
    const nonce = randomToken(32);
    const verifier = randomToken(48);
    const browserBinding = randomToken(32);
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    oauthFlows.set(state, {
      nonce,
      verifier,
      browserBindingHash: hashToken(browserBinding),
      expiresAt: Date.now() + OAUTH_FLOW_MS,
      returnTo: normaliseAccountReturnTo(returnTo)
    });
    const redirectUri = publicOrigin + "/auth/google/callback";
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set("client_id", googleClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return {
      location: url.toString(),
      cookie: sessionCookie(oauthCookieName, browserBinding, { secure: secureCookies, maxAge: Math.ceil(OAUTH_FLOW_MS / 1000) })
    };
  }

  async function finishGoogleLogin(callbackUrl, req) {
    if (!googleAvailable) throw accountError(503, "login_unavailable", "Google sign-in is not configured on this server.");
    const state = String(callbackUrl.searchParams.get("state") || "");
    const flow = oauthFlows.get(state);
    oauthFlows.delete(state);
    if (!flow || flow.expiresAt <= Date.now()) throw accountError(400, "invalid_oauth_state", "That sign-in attempt has expired.");
    try {
      const browserBinding = parseCookies(req?.headers?.cookie)[oauthCookieName] || "";
      if (!isSessionToken(browserBinding) || !safeTextEqual(hashToken(browserBinding), flow.browserBindingHash)) {
        throw accountError(400, "invalid_oauth_browser", "That sign-in response belongs to a different browser.");
      }
      if (callbackUrl.searchParams.get("error")) throw accountError(400, "login_cancelled", "Google sign-in was cancelled.");
      const code = String(callbackUrl.searchParams.get("code") || "");
      if (!code) throw accountError(400, "missing_oauth_code", "Google did not return a sign-in code.");

      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: publicOrigin + "/auth/google/callback",
          grant_type: "authorization_code",
          code_verifier: flow.verifier
        }),
        signal: AbortSignal.timeout(10_000)
      });
      const tokenResult = await response.json().catch(() => ({}));
      if (!response.ok || !tokenResult.id_token) throw accountError(502, "identity_provider_error", "Google could not complete sign-in.");
      const claims = await verifyGoogleIdToken(tokenResult.id_token, { clientId: googleClientId, nonce: flow.nonce });
      const profile = {
        provider: "google",
        subject: boundedText(claims.sub, 255),
        displayName: boundedText(claims.name, 80) || "Gahookz player",
        email: claims.email_verified ? boundedText(claims.email, 320).toLowerCase() : "",
        avatarUrl: safeHttpsUrl(claims.picture)
      };
      if (!profile.subject) throw accountError(502, "invalid_identity", "Google returned an incomplete identity.");
      const account = await repository.upsertIdentity(profile);
      const sessionToken = randomToken(32);
      const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
      await repository.createSession(hashToken(sessionToken), account.id, expiresAt);
      sessionCache.set(hashToken(sessionToken), { account, refreshAt: Date.now() + SESSION_CACHE_MS });
      return {
        account,
        returnTo: flow.returnTo,
        cookies: [
          sessionCookie(cookieName, sessionToken, { secure: secureCookies, maxAge: SESSION_MAX_AGE_SECONDS }),
          clearSessionCookie(oauthCookieName, { secure: secureCookies })
        ]
      };
    } catch (error) {
      if (error && typeof error === "object") error.returnTo = flow.returnTo;
      throw error;
    }
  }

  async function logout(req) {
    const cookies = parseCookies(req?.headers?.cookie);
    const token = cookies[cookieName] || cookies.gahookz_session || cookies["__Host-gahookz_session"] || "";
    if (isSessionToken(token)) {
      const tokenHash = hashToken(token);
      sessionCache.delete(tokenHash);
      await repository.deleteSession(tokenHash);
    }
    return clearSessionCookie(cookieName, { secure: secureCookies });
  }

  async function saveCustomGahook(accountId, slot, configuration) {
    const account = await repository.getAccount(accountId);
    if (!account) throw accountError(401, "account_required", "Sign in again before saving this Gahook.");
    const safeSlot = Math.trunc(Number(slot));
    if (!Number.isInteger(safeSlot) || safeSlot < 0 || safeSlot >= customGahookSlotCount(account)) {
      throw accountError(403, "slot_locked", "That custom Gahook slot is not unlocked.");
    }
    await repository.saveCustomGahook(accountId, safeSlot, configuration);
    invalidateAccount(accountId);
  }

  async function recordMatch(result) {
    if (!result?.accountId) return false;
    const recorded = await repository.recordMatch(result);
    if (recorded) invalidateAccount(result.accountId);
    return recorded;
  }

  async function close() {
    await repository.close?.();
  }

  return {
    authenticate,
    beginGoogleLogin,
    clearOAuthCookie: () => clearSessionCookie(oauthCookieName, { secure: secureCookies }),
    close,
    finishGoogleLogin,
    googleAvailable,
    logout,
    persistence,
    publicStatus,
    recordMatch,
    saveCustomGahook
  };
}

export function parseCookies(header = "") {
  const result = {};
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(rawValue);
    } catch {
      result[name] = "";
    }
  }
  return result;
}

export function validatePublicOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) return "";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function normaliseAccountReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const url = new URL(raw, "http://gahookz.local");
    if (url.origin !== "http://gahookz.local") return "/";
    url.hash = "";
    url.searchParams.delete("account");
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}

export function accountResultLocation(returnTo, result) {
  const url = new URL(normaliseAccountReturnTo(returnTo), "http://gahookz.local");
  url.searchParams.set("account", result === "connected" ? "connected" : "error");
  return url.pathname + url.search;
}

export function sessionCookie(name, token, { secure = false, maxAge = SESSION_MAX_AGE_SECONDS } = {}) {
  return [
    name + "=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + Math.max(0, Math.trunc(maxAge)),
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

export function clearSessionCookie(name, { secure = false } = {}) {
  return sessionCookie(name, "", { secure, maxAge: 0 });
}

export function publicAccount(account) {
  return {
    displayName: boundedText(account.displayName, 80),
    email: boundedText(account.email, 320),
    avatarUrl: safeHttpsUrl(account.avatarUrl),
    stats: normaliseCareerStats(account.stats),
    entitlements: normaliseEntitlements(account.entitlements),
    customGahookSlots: customGahookSlotCount(account),
    savedCustomGahooks: (Array.isArray(account.customGahooks) ? account.customGahooks : [])
      .map((item) => ({ slot: Math.trunc(Number(item.slot)), configuration: item.configuration }))
      .filter((item) => item.slot >= 0 && item.slot < customGahookSlotCount(account))
  };
}

function customGahookSlotCount(account) {
  const extra = Number(account?.entitlements?.custom_gahook_slot || 0);
  return Math.max(1, Math.min(12, 1 + (Number.isFinite(extra) ? Math.trunc(extra) : 0)));
}

function normaliseEntitlements(value) {
  const result = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, quantity] of Object.entries(value)) {
    if (!/^[a-z0-9_]{1,64}$/.test(key)) continue;
    const number = Math.max(0, Math.trunc(Number(quantity) || 0));
    if (number) result[key] = number;
  }
  return result;
}

function accountError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function isSessionToken(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{40,100}$/.test(value);
}

function boundedText(value, maximum) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function safeHttpsUrl(value) {
  const text = boundedText(value, 2_000);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function pruneOAuthFlows(flows, now = Date.now()) {
  for (const [state, flow] of flows) if (flow.expiresAt <= now) flows.delete(state);
  while (flows.size >= MAX_OAUTH_FLOWS) {
    const oldest = flows.keys().next().value;
    if (!oldest) break;
    flows.delete(oldest);
  }
}

async function verifyGoogleIdToken(token, { clientId, nonce }) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw accountError(502, "invalid_identity_token", "Google returned an invalid identity token.");
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw accountError(502, "invalid_identity_token", "Google returned an invalid identity token.");
  }
  if (header.alg !== "RS256" || !header.kid) throw accountError(502, "invalid_identity_token", "Google returned an unsupported identity token.");
  const jwks = await getGoogleJwks();
  const jwk = jwks.find((key) => key.kid === header.kid && key.kty === "RSA" && (!key.use || key.use === "sig"));
  if (!jwk) throw accountError(502, "identity_key_unavailable", "Google's signing key could not be verified.");
  let key;
  try {
    key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw accountError(502, "identity_key_unavailable", "Google's signing key could not be verified.");
  }
  const signed = Buffer.from(parts[0] + "." + parts[1]);
  const signature = Buffer.from(parts[2], "base64url");
  if (!crypto.verify("RSA-SHA256", signed, key, signature)) throw accountError(502, "invalid_identity_signature", "Google's identity signature was invalid.");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!GOOGLE_ISSUERS.has(claims.iss) || !audiences.includes(clientId)) throw accountError(502, "invalid_identity_audience", "Google's identity token was not issued for Gahookz.");
  if (audiences.length > 1 && claims.azp !== clientId) throw accountError(502, "invalid_identity_audience", "Google's identity token was not issued for Gahookz.");
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < nowSeconds - 30) throw accountError(502, "expired_identity_token", "Google's identity token expired.");
  if (Number.isFinite(Number(claims.iat)) && Number(claims.iat) > nowSeconds + 60) throw accountError(502, "invalid_identity_token", "Google's identity token timestamp was invalid.");
  if (!safeTextEqual(String(claims.nonce || ""), String(nonce || ""))) throw accountError(502, "invalid_identity_nonce", "That Google sign-in response did not match this browser.");
  return claims;
}

async function getGoogleJwks() {
  if (googleJwksCache.expiresAt > Date.now() && googleJwksCache.keys.length) return googleJwksCache.keys;
  const response = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.keys)) throw accountError(502, "identity_key_unavailable", "Google's signing keys are unavailable.");
  const maxAge = Math.max(60, Math.min(21_600, Number((response.headers.get("cache-control") || "").match(/max-age=(\d+)/i)?.[1]) || 3600));
  googleJwksCache = { expiresAt: Date.now() + maxAge * 1000, keys: body.keys };
  return body.keys;
}

function safeTextEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export function createMemoryAccountRepository() {
  const accounts = new Map();
  const identities = new Map();
  const sessions = new Map();
  const matches = new Set();

  function cloneAccount(account) {
    return account ? structuredClone(account) : null;
  }

  return {
    async upsertIdentity(profile) {
      const identityKey = profile.provider + ":" + profile.subject;
      let accountId = identities.get(identityKey);
      if (!accountId) {
        accountId = crypto.randomUUID();
        identities.set(identityKey, accountId);
        accounts.set(accountId, {
          id: accountId,
          displayName: profile.displayName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
          stats: emptyCareerStats(),
          entitlements: {},
          customGahooks: []
        });
      } else {
        const account = accounts.get(accountId);
        account.displayName = profile.displayName;
        account.email = profile.email;
        account.avatarUrl = profile.avatarUrl;
      }
      return cloneAccount(accounts.get(accountId));
    },
    async createSession(tokenHash, accountId, expiresAt) {
      sessions.set(tokenHash, { accountId, expiresAt });
    },
    async getSessionAccount(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt <= now) {
        sessions.delete(tokenHash);
        return null;
      }
      return cloneAccount(accounts.get(session.accountId));
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async getAccount(accountId) {
      return cloneAccount(accounts.get(accountId));
    },
    async saveCustomGahook(accountId, slot, configuration) {
      const account = accounts.get(accountId);
      if (!account) return;
      const next = account.customGahooks.filter((item) => item.slot !== slot);
      next.push({ slot, configuration: structuredClone(configuration) });
      account.customGahooks = next.sort((a, b) => a.slot - b.slot);
    },
    async recordMatch(result) {
      const unique = result.matchId + ":" + result.accountId;
      if (matches.has(unique)) return false;
      const account = accounts.get(result.accountId);
      if (!account) return false;
      matches.add(unique);
      account.stats = addCareerStats(account.stats, result.statDelta);
      return true;
    },
    async close() {}
  };
}

async function createPostgresAccountRepository({ databaseUrl, ssl, autoMigrate }) {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: ssl ? { rejectUnauthorized: true } : undefined
  });
  await pool.query("SELECT 1");
  if (autoMigrate) {
    const migration = await fs.readFile(MIGRATION_URL, "utf8");
    await pool.query(migration);
  }
  await pool.query("DELETE FROM account_sessions WHERE expires_at <= now()");

  async function getAccount(accountId, query = pool.query.bind(pool)) {
    const [accountResult, statResult, entitlementResult, customResult] = await Promise.all([
      query("SELECT id, display_name, email, avatar_url FROM accounts WHERE id = $1", [accountId]),
      query("SELECT * FROM career_stats WHERE account_id = $1", [accountId]),
      query("SELECT entitlement_key, sum(quantity)::integer AS quantity FROM account_entitlements WHERE account_id = $1 AND (expires_at IS NULL OR expires_at > now()) GROUP BY entitlement_key", [accountId]),
      query("SELECT slot, configuration FROM account_custom_gahooks WHERE account_id = $1 ORDER BY slot", [accountId])
    ]);
    const row = accountResult.rows[0];
    if (!row) return null;
    const stats = statRow(statResult.rows[0]);
    const entitlements = Object.fromEntries(entitlementResult.rows.map((item) => [item.entitlement_key, Number(item.quantity) || 0]));
    return {
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      stats,
      entitlements,
      customGahooks: customResult.rows.map((item) => ({ slot: Number(item.slot), configuration: item.configuration }))
    };
  }

  return {
    async upsertIdentity(profile) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query("SELECT account_id FROM account_identities WHERE provider = $1 AND provider_subject = $2 FOR UPDATE", [profile.provider, profile.subject]);
        let accountId = existing.rows[0]?.account_id;
        if (!accountId) {
          const candidateId = crypto.randomUUID();
          await client.query("INSERT INTO accounts (id, display_name, email, avatar_url) VALUES ($1, $2, $3, $4)", [candidateId, profile.displayName, profile.email, profile.avatarUrl]);
          const identity = await client.query("INSERT INTO account_identities (provider, provider_subject, account_id, email) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, provider_subject) DO NOTHING RETURNING account_id", [profile.provider, profile.subject, candidateId, profile.email]);
          if (identity.rows[0]) {
            accountId = candidateId;
          } else {
            const winner = await client.query("SELECT account_id FROM account_identities WHERE provider = $1 AND provider_subject = $2", [profile.provider, profile.subject]);
            accountId = winner.rows[0]?.account_id;
            await client.query("DELETE FROM accounts WHERE id = $1", [candidateId]);
          }
        }
        if (!accountId) throw new Error("Identity could not be linked to an account.");
        await client.query("UPDATE accounts SET display_name = $2, email = $3, avatar_url = $4, updated_at = now() WHERE id = $1", [accountId, profile.displayName, profile.email, profile.avatarUrl]);
        await client.query("UPDATE account_identities SET email = $3, last_login_at = now() WHERE provider = $1 AND provider_subject = $2", [profile.provider, profile.subject, profile.email]);
        await client.query("INSERT INTO career_stats (account_id) VALUES ($1) ON CONFLICT DO NOTHING", [accountId]);
        await client.query("COMMIT");
        return getAccount(accountId);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async createSession(tokenHash, accountId, expiresAt) {
      await pool.query("INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))", [tokenHash, accountId, expiresAt]);
    },
    async getSessionAccount(tokenHash, now) {
      const result = await pool.query("UPDATE account_sessions SET last_seen_at = now() WHERE token_hash = $1 AND expires_at > to_timestamp($2 / 1000.0) RETURNING account_id", [tokenHash, now]);
      return result.rows[0] ? getAccount(result.rows[0].account_id) : null;
    },
    async deleteSession(tokenHash) {
      await pool.query("DELETE FROM account_sessions WHERE token_hash = $1", [tokenHash]);
    },
    getAccount,
    async saveCustomGahook(accountId, slot, configuration) {
      await pool.query("INSERT INTO account_custom_gahooks (account_id, slot, configuration) VALUES ($1, $2, $3::jsonb) ON CONFLICT (account_id, slot) DO UPDATE SET configuration = excluded.configuration, updated_at = now()", [accountId, slot, JSON.stringify(configuration)]);
    },
    async recordMatch(result) {
      const delta = normaliseCareerStats(result.statDelta);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query("INSERT INTO account_match_results (match_id, account_id, room_code, game_mode, score, placement, player_count, stat_delta) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) ON CONFLICT DO NOTHING RETURNING match_id", [result.matchId, result.accountId, result.roomCode, result.gameMode, result.score, result.placement, result.playerCount, JSON.stringify(delta)]);
        if (!inserted.rowCount) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(`
          INSERT INTO career_stats (
            account_id, games_played, wins, podiums, total_score, high_score,
            answers_submitted, correct_answers, popular_choices, questions_authored,
            herd_votes_received, gahooks_sent, gahooks_received
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (account_id) DO UPDATE SET
            games_played = career_stats.games_played + excluded.games_played,
            wins = career_stats.wins + excluded.wins,
            podiums = career_stats.podiums + excluded.podiums,
            total_score = career_stats.total_score + excluded.total_score,
            high_score = greatest(career_stats.high_score, excluded.high_score),
            answers_submitted = career_stats.answers_submitted + excluded.answers_submitted,
            correct_answers = career_stats.correct_answers + excluded.correct_answers,
            popular_choices = career_stats.popular_choices + excluded.popular_choices,
            questions_authored = career_stats.questions_authored + excluded.questions_authored,
            herd_votes_received = career_stats.herd_votes_received + excluded.herd_votes_received,
            gahooks_sent = career_stats.gahooks_sent + excluded.gahooks_sent,
            gahooks_received = career_stats.gahooks_received + excluded.gahooks_received,
            updated_at = now()
        `, [result.accountId, delta.gamesPlayed, delta.wins, delta.podiums, delta.totalScore, delta.highScore, delta.answersSubmitted, delta.correctAnswers, delta.popularChoices, delta.questionsAuthored, delta.herdVotesReceived, delta.gahooksSent, delta.gahooksReceived]);
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

function statRow(row = {}) {
  return normaliseCareerStats({
    gamesPlayed: row.games_played,
    wins: row.wins,
    podiums: row.podiums,
    totalScore: row.total_score,
    highScore: row.high_score,
    answersSubmitted: row.answers_submitted,
    correctAnswers: row.correct_answers,
    popularChoices: row.popular_choices,
    questionsAuthored: row.questions_authored,
    herdVotesReceived: row.herd_votes_received,
    gahooksSent: row.gahooks_sent,
    gahooksReceived: row.gahooks_received
  });
}
