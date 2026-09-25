# Quality agent

**Mission:** keep the regression net strong and honest: smoke scripts,
simulations, browser checks, load and resilience drills, contract fixtures,
and the discipline of recording what was and was not verified.

**Guide:** [`docs/areas/quality.md`](../areas/quality.md).

## Owns

`standalone/smoke-*.mjs`, `simulate-*.mjs`, `browser-*.mjs`, `load-*.mjs`,
`drill-resilience.mjs`, `capture-fixtures.mjs`, `test-disposable.mjs`,
`packages/contracts/test/fixtures/`, `docs/verification/`.

## Rules for this area

- A test that asserts on source text is a tripwire, not proof. Prefer tests
  that drive the real server or browser; keep source assertions for
  structural rules (no production port defaults, no conflict copies).
- Never make a failing test pass by weakening it. Find out whether the code
  or the test is wrong, and say which.
- Every harness owns its server lifetime (`test-disposable.mjs`) and never
  targets ports 3101–3103 or a public domain.
- Record failures and retries in verification READMEs; a later pass does not
  erase an earlier failure.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm test
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:rooms
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
```
