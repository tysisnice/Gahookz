const DEFAULT_MAX_JSON_BYTES = 8_000_000;

export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function applySecurityHeaders(res, { secure = false } = {}) {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join("; "));
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self), payment=()");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function assertSameOrigin(req) {
  if (String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") {
    throw new HttpError(403, "cross_site_request", "Cross-site requests are not allowed.");
  }

  const origin = String(req.headers.origin || "").trim();
  if (!origin) return;

  let originHost = "";
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw new HttpError(403, "invalid_origin", "That request origin is not allowed.");
  }
  const requestHost = String(req.headers.host || "").trim().toLowerCase();
  if (!requestHost || originHost !== requestHost) {
    throw new HttpError(403, "invalid_origin", "That request origin is not allowed.");
  }
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export async function readJson(req, options = {}) {
  const maxBytes = typeof options === "number" ? options : Number(options.maxBytes || DEFAULT_MAX_JSON_BYTES);
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json" && !contentType.endsWith("+json")) {
    throw new HttpError(415, "unsupported_media_type", "Send this request as JSON.");
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "request_too_large", "Request is too large.");
  }

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += bytes.length;
    if (receivedBytes > maxBytes) {
      throw new HttpError(413, "request_too_large", "Request is too large.");
    }
    chunks.push(bytes);
  }

  if (receivedBytes === 0) return {};
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks, receivedBytes).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new HttpError(400, "invalid_json_shape", "Request body must be a JSON object.");
  }
  return payload;
}

/**
 * Write one state frame, honouring backpressure.
 *
 * Two things matter here. The frame goes out as a **single** write, so a slow
 * socket can never leave half an event on the wire for the next one to finish.
 * And the return value of `res.write` is the signal that the kernel buffer is
 * full: ignoring it, as this used to, means Node queues every snapshot for a
 * reader that is not draining, and one stalled phone grows the server's memory
 * for as long as it stays connected.
 *
 * Returns false when the socket is saturated. The caller decides what to do --
 * for room state the answer is to hold only the newest snapshot, because state
 * is replaceable and a stalled client gains nothing from the backlog.
 */
export function writeSseState(res, snapshot) {
  return res.write("event: state\ndata: " + JSON.stringify(snapshot) + "\n\n");
}
