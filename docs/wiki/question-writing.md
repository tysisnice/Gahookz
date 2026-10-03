# Writing questions

> Before the game starts, every player writes their own questions, and the host starts once everyone is ready.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

After the host locks the rules, the room is Building and each player sees a **Question 1 of N** form ([Game setup](game-setup.md) sets N).

- **Give me a funny prompt** fills the form from the shared catalogue. The label changes with the room: "Give me a learning question", "Give me an opinion question" ([Majority Rulez](majority-rulez.md)) or "Give me a Herd question" ([Herd](herd.md)). See [Prompts and suggestions](prompts-and-suggestions.md).
- **Question text** is 4 to 180 characters. **Optional question image:** upload a picture or draw one.
- **Answers:** two to four, up to 80 characters each. In Classic you tick the right one. In Majority Rulez the tick is an optional prediction of the room's pick. In Herd there are no answers, because friends write the options later.
- **Submit question** adds it. It can be edited and resubmitted until the game starts.

If the host has turned on "Approve questions before they go in" ([Lobby rules](lobby-rules.md)), a submission waits as pending. The host sees it under **Question approvals** and chooses Approve or Reject. A rejected question frees the slot and clears Ready.

## Rules and numbers

- Classic will not submit without a right answer: "Choose an intended answer before adding this question."
- **Ready up** appears once a player's full share is in and nothing is pending.
- Start is refused until everyone connected is done: "Add at least one question first.", "Approve or reject pending questions first." or "Every connected player needs their questions submitted and ready status."
- **Skip** fills the gaps from the catalogue; Classic only uses verified answers.

## Where it lives

| Part | Code |
| --- | --- |
| Builder | `standalone/public/app.jsx` — `QuestionBuilder`, `PlayerLobby`, `ImageUploadDrawPicker` |
| Approval | `standalone/public/app.jsx` — `QuestionApprovalPanel`; `standalone/server.js` — `approveQuestion`, `rejectQuestion` |
| Server | `standalone/server.js` — `submitQuestion`, `normaliseQuestion`, `getStartCheck` |
| Readiness | `packages/contracts/src/host-settings.ts` — `questionReadinessProblem` |
| Tests | `standalone/smoke-majority-flow.mjs`, `standalone/smoke-room-rules.mjs` |

## Related

- [Quiz · Classic](quiz-classic.md), [Phases and timers](phases-and-timers.md), [Lobby](lobby.md)

## History

- 2026-07-20 — Builder, funny-prompt button, optional image and host approval exist from the first commit (`dd449f2`).
- 2026-08-26 — Shared image upload and draw picker arrives with the new modes (`178d56b`).
- 2026-09-11 — Suggestions share one source and never invent a right answer (`4231d68`).
- 2026-09-19 — Quiz and Herd overhaul merged to `main` (`78a1382`).
