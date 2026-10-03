# Architecture overview

> This page describes what the code does today, except for the last section,
> which is a plan. Last checked 2026-10-04.

## 1. Summary

Gahookz is a real-time party game (Quiz, Majority Rulz and Herd, plus a social
layer of Gahooks, chat, a whiteboard and a 1v1 arena) that runs on one Fedora
machine at `gahookz.com`. Browsers send small JSON commands with `POST /api/*`
and watch the room through Server-Sent Events (SSE). There are no WebSockets.
One Node process per environment holds every room in memory, decides everything
that matters (phase, time, points, who may see what) and also serves the
browser app, the PWA shell and room media. Nobody needs an account to host,
join or finish a game. Accounts are an optional extra layer, and production does
not have them configured today.

```text
Browser / installed PWA
   │  HTTPS
   ▼
Cloudflare (authoritative DNS only, DNS-only mode, no proxying)
   │
   ▼
Home router, TCP 80 and 443
   │
   ▼
Nginx Proxy Manager ──── Docker network `gahookz-proxy` ────┐
   ├─ gahookz.com, www.gahookz.com ──> gahookz       (production, host port 3102)
   ├─ beta.gahookz.com ──────────────> gahookz-beta  (beta, host port 3103)
   └─ dev.gahookz.com (access list) ─> gahookz-dev   (development, host port 3101)
```

Each container listens on port 3001 inside Docker; the host ports 3101 to 3103
are loopback bindings used for local checks, not the public path. All three
run from the Store repository, `/mnt/storage/syncthing/Store/Projects/gahookz`,
since 2026-10-02.

| Environment | Image and source | Notes |
| --- | --- | --- |
| Production `gahookz` | Immutable image, Compose project `gahookz-prod` | Changed only by a deliberate, requested deploy |
| Beta `gahookz-beta` | Image of the production target | Capped at two rooms, no database |
| Development `gahookz-dev` | Bind-mounts the Store working tree, hot reload | Every save in that tree reloads it |

Hosting commands and deploy rules are in [Hosting and deploys](../wiki/hosting-and-deploys.md)
and [the runbook](../operations/runbook.md). The proxy-to-container mapping is
taken from `CLAUDE.md` and the Compose file; the Nginx Proxy Manager
configuration itself is not in this repository.

## 2. Processes and transport

_To be written._

## 3. State ownership

_To be written._

## 4. Limits

_To be written._

## 5. Code layout

_To be written._

## 6. Where it is heading

_To be written. This section will be a plan, not built behaviour._
