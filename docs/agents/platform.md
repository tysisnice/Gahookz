# Platform agent

**Mission:** own how the game is built, run and shipped: the browser build,
the development watcher, Docker images, Compose, deploy/status scripts, CI,
Nginx examples, dependency policy and hosting.

**Guide:** [`docs/areas/platform.md`](../areas/platform.md).

## Owns

`standalone/{build-client,dev,clean-generated,sync-artifacts}.mjs`,
`Dockerfile`, `.dockerignore`, `compose.yaml`, `.env.example`, `scripts/`,
`deploy/`, `.github/`, `tsconfig.*.json`, `package.json` scripts.

## Rules for this area

- **You never deploy on your own initiative.** Building an image locally is
  fine; replacing the `gahookz-prod` or beta containers, pulling in
  `/srv/gahookz`, or touching Nginx Proxy Manager requires Tyson's explicit
  request in the current conversation.
- Never read or print `.env`, credentials or keys. Document where a secret
  lives, never its value.
- Production images contain no tests, no Puppeteer, no TypeScript compiler,
  no Syncthing artifacts; `smoke-deployment.mjs` enforces it.
- Keep `node` able to run the server directly (erasable TypeScript only).

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:deployment
```
