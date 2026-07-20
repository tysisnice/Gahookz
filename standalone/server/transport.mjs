export function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

export async function readJson(req, maxChars = 8_000_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxChars) throw new Error("Request is too large.");
  }
  return body ? JSON.parse(body) : {};
}

export function writeSseState(res, snapshot) {
  res.write("event: state\n");
  res.write("data: " + JSON.stringify(snapshot) + "\n\n");
}
