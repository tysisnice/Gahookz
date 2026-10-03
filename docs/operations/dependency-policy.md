# Dependencies and base images

Status 2026-10-04: still accurate: the runtime surface is `pg` and `tsx`, the
base image is pinned by digest, and `erasableSyntaxOnly` is on in
`tsconfig.base.json`. Corrected below: `tsx` loads the TypeScript modules only
for development, tests and `npm start`; the production image runs plain
`node standalone/server.js` and relies on Node 24's own type stripping.
`package.json` still allows Node `>=20`, but CI, Docker and the verified runtime
are Node 24. Production, beta and dev have built from the Store repository since
2026-10-02. Run the matrix under `flock /tmp/gahookz-verify.lock` with
`PATH=/usr/bin:$PATH` so Node 24 is used.

Gahookz runs on two runtime dependencies — `pg` and `tsx` — and that is a
deliberate property, not an accident of youth. It is why a security advisory
here is usually somebody else's problem, and why the container is small enough
to redeploy without thinking about it.

This records how to keep that true.

## The runtime surface

| Dependency | Why it is there | Notes |
| --- | --- | --- |
| `pg` | PostgreSQL client for optional accounts | Only reached when `GAHOOKZ_DATABASE_URL` is set |
| `tsx` | Loads the incrementally migrated TypeScript modules in development, tests and `npm start`; the production image runs plain `node` and does not use it | Pulls in `esbuild` transitively; both are installed in the production image legitimately |

Development dependencies — `typescript`, `esbuild`, `puppeteer`, the `@types`
packages — **never reach a shipped image**. The production stage installs with
`npm ci --omit=dev`, container builds set `PUPPETEER_SKIP_DOWNLOAD=1`, and
`smoke-deployment.mjs` fails the build if any of that regresses.

## Before adding a runtime dependency

Ask, in order:

1. Can the platform already do it? Node has a test runner, a fetch, a crypto
   module and now type stripping.
2. Is it small enough to read? A dependency you cannot read is a dependency you
   cannot assess when an advisory lands.
3. Does it pull a tree? Check `npm ls <name>` before, not after.

A development dependency is a much cheaper decision than a runtime one, and the
guards above are what keep the two separate.

## Erasable syntax only

`tsconfig.base.json` sets `erasableSyntaxOnly: true`, and this is load-bearing
rather than stylistic.

The production image runs `node standalone/server.js` directly, and Node strips
TypeScript types **by erasure**. Anything requiring code generation — parameter
properties, `enum`, `namespace`, decorators — parses in development under `tsx`
and then fails at container start-up with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.
That exact failure shipped into `packages/content` during P05 and was only
caught when a real image was built in P12. The compiler flag now catches it at
`npm run typecheck`.

## Base image

The Dockerfile pins `node:24-alpine` **by digest**, so a rebuild cannot quietly
change the runtime underneath a release.

Reviewing it is therefore a deliberate act:

```bash
docker pull node:24-alpine
docker image inspect node:24-alpine --format '{{index .RepoDigests 0}}'
```

Update the digest in the Dockerfile, rebuild, and run the full matrix below
before deploying. Do not update it as part of an unrelated change: a base image
bump deserves its own commit so it can be reverted on its own.

## A periodic check

There is no automated dependency bot, on purpose — a project with two runtime
dependencies does not need a robot opening pull requests. Instead, roughly
monthly, or before any deploy that follows a long gap:

```bash
npm audit --omit=dev          # runtime surface only
npm outdated                  # what has moved
docker pull node:24-alpine    # compare against the pinned digest
```

Then run the release matrix. If `npm audit` reports nothing on the runtime
surface, a development advisory is worth reading but is not a reason to rush a
deploy — nothing in `devDependencies` runs in production.

## The release matrix

```bash
npm run clean:generated && npm run build   # never `rm client/*.js`; that deletes source
npm run check                              # typecheck, unit tests, build
# each of the following on its own fresh disposable server on port 3199
npm test
npm run test:rooms
npm run test:browser
npm run drill:resilience
docker build --target production -t gahookz:candidate .
```

The separate server lifetimes matter: the 32-room cap means reusing one process
across batches fails on capacity rather than on a defect.
