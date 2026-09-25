# Roadmap, growth and making money — proposal

**Status:** proposal for Tyson, written 2026-09-25. Nothing in this document
is built or approved yet; it answers the *Future* section of the 2026-09-25
update note. Decisions it needs are listed at the end. For the engineering
backlog see [`docs/backlog.md`](../backlog.md); for accounts in detail see
[`accounts-plan.md`](accounts-plan.md).

Tyson's goals, in his words: *"I want to make money off this eventually. I
also want to get this game out there to as many people as possible soon."*
Those pull in different directions early on: every ad, paywall or sign-up is
friction for the first thousand players. The plan below therefore puts
**reach first, then low-friction revenue, then premium**, and never
monetises in a way that makes the game worse to play.

## Where the game stands today

- A polished, installable web game with three ways to play, Gahooks, a 1v1
  arena, chat, drawing and custom Gahooks. No app install and no account are
  needed to host or join — that is the strongest growth asset and it must be
  kept.
- It runs on one two-core laptop at home, as a **single process** that holds
  every room in memory (see [architecture overview](../architecture/overview.md)).
  Measured on 2026-09-19: one 15-player room Gahooking constantly uses about a
  quarter of one core; the process refuses a 33rd simultaneous room. A restart
  ends every game.
- Accounts, career stats and saved Gahooks are written but **inert in
  production** (no database or Google sign-in configured).
- No analytics, no payments, no ads, no store presence.

## Stage 1 — get it into many hands (now → ~6 weeks)

The cheapest growth is making each game recruit the next one.

1. **Make every game shareable.** A room link and QR code already exist. Add:
   a "Play again with this crew" flow that keeps the room and its players; a
   finale share card (image of the podium and the funniest Gahook) that uses
   the phone's share sheet; an invite link that opens straight into the join
   screen with the name field focused.
2. **Measure without surveillance.** Add privacy-light, aggregate counters
   (rooms created, games finished, players per game, join failures, time to
   first question, rematches) to `/api/metrics` and a tiny dashboard. No
   personal data, no third-party trackers. You cannot grow what you cannot see.
3. **A feedback button** in the menu that posts to the host-private report
   channel or a simple server log, so friends' "everyone says the music is
   terrible" arrives as data.
4. **List the web game where players look for free party games**, all of
   which allow a game hosted on your own domain:
   - [itch.io](https://itch.io) (free, no exclusivity, good for a "browser
     party game" page with a link to gahookz.com);
   - Reddit communities for web and party games, Discord servers for party
     games, Product Hunt;
   - short clips of Gahook jump scares and 1v1 finishes for TikTok, Reels
     and Shorts — the game's funniest moments are visual and five seconds
     long, which is exactly the format.
5. **Streamers.** Party games spread through streamers (Jackbox is the
   model: the streamer hosts on screen, chat joins on phones). Build a
   **streamer mode**: hide the room code behind a click-to-reveal on the host
   screen, optional room password shown only to the streamer, a large-type
   party view, a "chat audience" that can vote but not play (spectators
   already exist), and profanity/drawing filters on by default. Then contact
   small and mid-size variety streamers directly with a one-page press kit and
   a pre-made room.
6. **Hosting for a bigger audience.** The laptop is enough for friends and a
   small launch. Before any campaign, move production to a machine that is
   not also a home server: a small cloud VM (2–4 vCPU, 2–4 GB RAM, in
   Australia or wherever players are) or the desktop that the 2026-09-19
   hosting study assessed. Keep **one process** (the design requires it) and
   raise the room cap only after measuring. Add uptime monitoring and a
   status message ("a new version is coming, finish your game").

*Exit check:* strangers finish games without help, and a noticeable share of
rooms are created by people who first joined someone else's room.

## Stage 2 — low-friction revenue (after Stage 1 shows real usage)

### Ads — where they fit and where they do not

Tyson suggested ads "perhaps when getting gahooked or after each game".

- **After each game — yes, carefully.** The natural break is the finale,
  after the podium and cheer, before "Play again". Show at most one
  interstitial per player per finished game (and none for a room's first
  game, so new players never meet an ad before they have had fun). Google's
  H5 games ads (the [Ad Placement API](https://developers.google.com/ad-placement))
  exist for exactly this: interstitial and rewarded "ad breaks" in HTML5
  games, with frequency decided by the API and settings changeable without a
  release.
- **Rewarded ads — yes, and players like them.** Optional "watch an ad to …"
  rewards that do not affect scoring: try a premium Gahook character for the
  next game, unlock an extra custom Gahook slot for a day, a cosmetic confetti
  burst at the finale.
- **When getting Gahooked — no ad, but a sponsor slot is possible.** A Gahook
  lands mid-round, when the player is racing a timer. An ad there would cost
  them points and feel like the game cheating, and every Gahook would become
  a reason to quit. The playful alternative is a **sponsored Gahook
  character** (a brand-themed form players can choose), sold as a
  partnership once the game has an audience.
- **Never** during a live round, on the join path, or on the shared party
  screen while a game is running.
- **Before ads go live:** a consent banner for regions that require consent
  for personalised ads; a decision about younger players (the game is
  family-friendly, and ads shown to children carry extra legal obligations —
  consider contextual/non-personalised ads only); the privacy notice updated
  and legally reviewed (`/legal` has not been reviewed by a lawyer).
- **Honest expectation:** web game ad revenue per player is small. Ads pay
  noticeably only at tens of thousands of games a month; below that, one
  supporter purchase outweighs thousands of ad impressions.

### Paid cosmetics — the best first money

These sell expression, never advantage, which keeps the game fair:

- **Gahook character packs** (e.g. a "Premium Pack" of 4–6 new characters with
  their own sounds and full-screen effects — the Sad Pig and the other
  premium forms show the style) as one-time purchases.
- **More custom Gahook slots**, longer recorded sounds, extra poses, animated
  profile pictures, finale victory dances, name colours.
- **A one-off Supporter Pack** ("support the dev" bundle with a badge) — the
  simplest possible first product.
- Delivery: an account (optional for play, required to *own* something),
  server-verified entitlements (already modelled in `server/accounts.mjs`),
  and a web checkout. Stripe Payment Links are the quickest start; web
  purchases must not be sold inside an iOS app without Apple's in-app
  purchase.

## Stage 3 — premium mode and stores (once accounts and payments work)

### Gahookz Premium (host pays, the room benefits)

Party games monetise best when **one host pays and everyone plays free**:

- no ads for anyone in a Premium host's room;
- bigger rooms (e.g. 30 players, after load testing), streamer mode, audience
  voting;
- saved question banks and custom prompt packs, reusable across games;
- premium prompt packs (Family, Christmas, Office Party, Classroom with
  verified facts);
- room themes and the Premium character pack for the host.

Offer it as a modest monthly or yearly subscription **and** a one-time "party
pass" (24 hours) for someone hosting one event. Guest players never pay.

### App stores

- **Google Play:** the game is already a PWA, so a
  [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)
  wrapper (Bubblewrap) can publish it with little new code. It needs Digital
  Asset Links to prove the site and app come from the same developer and must
  meet the installability bar. Digital purchases inside the Play app must
  follow Google Play's billing rules.
- **Apple App Store:** a plain website wrapper is likely to be rejected —
  [guideline 4.2](https://developer.apple.com/app-store/review/guidelines/)
  asks for features "that elevate it beyond a repackaged website". Build a
  Capacitor app with native value (share sheet, haptics, camera for profile
  pictures, push "your friend is hosting"), use in-app purchase for anything
  unlocked inside the app (guideline 3.1.1), and offer in-app account deletion
  (guideline 5.1.1(v)) — the accounts work now under way adds deletion for
  this reason.
- **Steam:** a paid "host edition" (large-screen party view, controller
  support, bundled Premium features, a few exclusive characters) is the
  classic party-game business. Phones still join through the website, so the
  server stays the same.

### Web game portals

Portals bring millions of players but come with conditions — decide per
portal:

- [CrazyGames](https://docs.crazygames.com/requirements/intro/): ads only
  through their SDK ("No external ads"), and for a Full Launch progress must
  be linked to the CrazyGames account with their username/avatar, plus
  multiplayer requirements such as invite links, an instant multiplayer flow
  and keeping rooms across rounds. In-game purchases are invite-only through
  their payment provider.
- [Poki](https://developers.poki.com/guide/working-with-poki): revenue is
  split 50/50 for players Poki brings, 100% for players who come directly;
  **web exclusivity** is required (no other web portals), while Steam and app
  stores stay allowed.

A portal build would be a separate, lightly branded client (their SDK for
ads and identity, their rules) talking to the same game server — worth it
once the server is off the laptop and can take the load.

## Recommended sequence

| When | Do | Why |
| --- | --- | --- |
| Now | Finish the current update; move production off the laptop before any public push; streamer mode; share card; privacy-light metrics | Reach and reliability first |
| +1 month | Provision accounts (Google sign-in, database); legal review of `/legal`; Supporter Pack and first character pack via web checkout | First revenue with no gameplay cost |
| +2 months | itch.io page, clips, streamer outreach; Play Store via TWA | Many more players, little new code |
| +3 months | After-game and rewarded ads on the web build (with consent); Premium host mode | Revenue that scales with usage |
| +6 months | Capacitor iOS app with IAP; Steam host edition; one portal if the numbers justify it | Bigger platforms once the basics are proven |

## Decisions Tyson needs to make

1. **Audience age.** Is Gahookz for everyone including children, or 13+?
   This decides the ad strategy, privacy obligations and prompt tone.
2. **Ads at all?** The previous roadmap ruled out "interruptive in-room ads".
   This proposal keeps that rule for live rounds and allows after-game and
   rewarded ads. Confirm or veto.
3. **First product and price** — Supporter Pack, a character pack, or both.
4. **Where production runs** before a public push: a cloud VM (monthly cost,
   no home-network exposure) or the desktop.
5. **Portal exclusivity** — Poki's web exclusivity versus staying on your own
   domain and itch.io.
6. **Legal** — who reviews the terms and privacy notice before accounts,
   payments or ads go live.

## Sources checked for this proposal (2026-09-25)

- Google, *Ad Placement API*: <https://developers.google.com/ad-placement>
- CrazyGames, *Requirements — introduction*: <https://docs.crazygames.com/requirements/intro/>
- Poki, *Working with Poki*: <https://developers.poki.com/guide/working-with-poki>
- Chrome for Developers, *Trusted Web Activity*: <https://developer.chrome.com/docs/android/trusted-web-activity>
- Apple, *App Review Guidelines* (4.2, 3.1.1, 5.1.1(v)): <https://developer.apple.com/app-store/review/guidelines/>

Store and portal terms change; re-read them before acting on any of this.
