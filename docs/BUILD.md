# Build recipe: a small creative club

This is the implementation recipe for the single product hypothesis selected by the Audience App Lab study. It is not a claim that eleven pain points justify eleven businesses. Research and implementation evidence are different: finishing a technical journey does not establish retention, learning gains or willingness to pay.

## First useful serving

An adult casual maker chooses a small prompt, paints something, saves it, leaves, and reopens the same editable work. They can export it and optionally showcase it. AI assistance is optional: generate or edit, compare the proposal, then keep or discard it without silently replacing the original. A second person can respond to a shared piece, while private project files remain inaccessible to them.

The release boundary includes private projects, a curated showcase, artwork-specific conversations, follow/activity, XP and account recovery. Open direct messages, simultaneous multiplayer painting, payments, a marketplace, objective skill grading and a claim of teaching drawing are outside this version.

The user did not specify React experience, a hosting budget, test-device access or an acquisition channel. The learning path assumes basic JavaScript familiarity and introduces React where needed; this is an instructional assumption, not a user credential. A web app fits the requested browser workflow without a store installation. Desktop mouse, touch and stylus behavior must be assessed separately; viewport screenshots do not prove physical-device drawing quality.

## Ingredients and current stack

Versions below are the repository's pinned versions inspected on 26 October 2026, not a promise that they are globally newest.

| Ingredient         | Choice and reason                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI and routing     | Next.js **16.4.3**, React / React DOM **19.3.1**, TypeScript **5.9.3**. App Router supplies the connected studio, collection and public routes.                                                                                                                       |
| Painting           | Browser canvas with a bounded layered document, local IndexedDB drafts, PNG and editable-project export. This delivers a useful manual workflow independently of AI output.                                                                                           |
| Data and functions | Convex **1.48.0** for reactive data, server-enforced ownership, storage, actions and scheduled job expiry. Its deployment and storage are real operating dependencies.                                                                                                |
| Identity           | `@convex-dev/auth` **0.0.96**, `@auth/core` **0.41.3**. Password auth and a recovery provider use maintained Convex Auth helpers. Convex Auth remains a vendor beta; upgrades need migration and account/recovery tests.                                              |
| Images             | Direct OpenAI Image API calls from a Convex Node action. The current adapter uses `gpt-image-2.5-flare` for generation and `gpt-image-2.5-sunburst` for edits, with explicit low-quality 1024×1024 PNG requests. Review source compatibility before changing a model. |
| Styling            | Tailwind CSS **3.4.19**, scoped CSS modules and Lucide React **1.61.0**. The clubhouse and painting surfaces have their own styles and input states.                                                                                                                  |
| Delivery           | GitHub `RobertIonutF/canvas-club`, linked to Vercel project `canvas-club-studio`, production branch `main`. The production build deploys backend code before building the frontend.                                                                                   |

The repository's bundled Next.js documentation was read for installation, deployment and environment-variable behavior. Minimum Node.js is 20.9. Official references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [React learning](https://react.dev/learn), [Convex functions](https://docs.convex.dev/functions), [Convex Auth](https://labs.convex.dev/auth), [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation), [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github).

**Credible alternative:** Vite + React + TypeScript with the same Convex backend, auth and storage. It removes Next.js server/framework conventions for a largely client-interactive product, but still needs deliberate auth integration, route handling, environment separation and hosting configuration. It does not remove the hard canvas, recovery, provider-cost or community work. Next.js is implemented here; the Vite alternative has not been built or compatibility-tested. [Vite guide](https://vite.dev/guide/).

Required accounts and access: a repository owner, Vercel project access, separate authorized Convex development/production deployments and a usable approved OpenAI API project. Provider account verification, billing access and model eligibility may be required. Source drawings and uploads must be user-owned or licensed; no permission to train on uploads, scrape artists or remix another maker's work is assumed.

## Cost ingredients

No subscription price, gross margin or free-at-scale promise is established. The operating inputs are:

- **Development:** developer time, a suitable computer and actual target-device tests. Existing accounts or introductory credits are not evidence of zero recurring cost.
- **Release:** optional domain purchase and any chosen service-plan upgrades. No paid domain is required to use a provider-assigned URL.
- **Recurring:** hosting/backend plans, file storage, bandwidth, database operations, monitoring, support and human moderation.
- **Usage:** OpenAI image/text input and image output usage, including iterations that users reject. Quality, size, model and input images affect the result; requests are not a constant-cost unit.

Measure actual session usage before setting an AI allowance or customer price. Consult the current [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Convex pricing](https://www.convex.dev/pricing) and [Vercel pricing](https://vercel.com/pricing) for the selected account/region; no numeric price from those pages is asserted here. There is no payment integration in this release. No fixed delivery date is promised: learning, provider/account access, browser failures and production review determine effort.

## Ordered learning ladder

| Learn next                                 | Why it is needed                                                                      | Small exercise                                                                                        | Ready when / reference                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React state, events and component identity | Tool selection, layer controls and auth modes must preserve or reset the right state. | Build a color/tool selector and switch between two forms without retaining a password.                | Selected controls and field resets behave predictably. [React state](https://react.dev/learn/managing-state)                                                                                                               |
| Pointer input and canvas coordinates       | Drawing must follow a pointer correctly under zoom and pan.                           | Draw a line, change zoom, and draw to the same visual point.                                          | Mouse/touch coordinates map to the same document coordinates. [Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) |
| Bounded documents and IndexedDB            | A page refresh must not erase an unsaved drawing.                                     | Save/reopen a two-layer dummy document, then simulate storage denial.                                 | The document reopens, or the user receives a useful export/recovery path. [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)                                                                      |
| Convex queries, mutations and ownership    | Users need persistent projects without access to another user's private files.        | Create two test accounts and try reading/writing the other account's project.                         | Both unauthorized operations fail server-side. [Convex auth in functions](https://docs.convex.dev/auth/functions-auth)                                                                                                     |
| Versioned saving and conflict recovery     | A stale tab must not silently overwrite newer work.                                   | Save from two tabs at the same expected version.                                                      | One save is rejected and the local competing copy remains recoverable. [Convex transactions](https://docs.convex.dev/database/advanced/occ)                                                                                |
| Server-side image requests and job states  | Slow or failed generation must not erase work or invite unlimited retries.            | Submit one authorized bounded request; exercise a fixture failure/expired job separately.             | The original stays intact and a terminal status or expiry appears. [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation)                                                                    |
| Auth and recovery semantics                | Account recovery is part of keeping a collection safe.                                | Rotate codes and use one in a disposable test account.                                                | Used/old/foreign codes fail, new password succeeds, old sessions lose access. [Convex Auth](https://labs.convex.dev/auth)                                                                                                  |
| Deployment and data recovery               | A frontend rollback does not automatically restore backend functions or files.        | Deploy to development, export a snapshot including files, and restore to an isolated test deployment. | A known project, preview and access rule survive the rehearsal. [Convex export](https://docs.convex.dev/database/import-export/export)                                                                                     |

## Hardest spike: preserve work across assistance and failure

The difficult part is not displaying a generated picture. It is retaining an editable original through image proposals, slow uploads, page interruption, account changes and competing saves. Provider editing is probabilistic; exact image preservation cannot be guaranteed through a prompt alone.

Before expanding the feature list, run a bounded spike with a distinctive two-layer drawing:

1. Save it and export an editable backup. Refresh and compare the reopened layer state.
2. Request one approved AI proposal. Before acceptance, verify that the original document and preview have not been replaced.
3. Discard the proposal; then accept a separate proposal as a new layer, with room below the eight-layer limit. Repeat/reload around the decision boundary to check that it is not inserted twice.
4. Interrupt saving, then recover the device copy. Open a stale second tab and attempt a conflicting save; retain both recoverable states.
5. Sign into another test account and ensure no private cloud project or another user's unsaved device draft is silently adopted.

Pass only when the original is recoverable, decisions are durable, duplicated acceptance is prevented, cloud-save conflicts are explicit and private data stays private. On failure, keep manual painting/export useful and stop expanding AI/social scope until the recovery bug is fixed. This spike needs approved model access for a real provider result; fixtures test state behavior but cannot prove model access or image fidelity. Final browser acceptance of this connected spike is still under review at this document's writing.

## Dependency-ordered cooking sequence

| Step | Component → concrete action                                                                                                                                      | Observable done check                                                                                                                                     | Common mistake                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | Feasibility → confirm accounts, approved credentials, art rights and the preservation spike above.                                                               | One manual save/reopen/export succeeds; provider access and its failure path are distinguished.                                                           | Calling a mocked image a successful live integration.                       |
| 2    | Workspace → clone this repository, run `npm ci`, connect development Convex, then run backend/frontend terminals from the project root.                          | Local routes load with the intended development deployment.                                                                                               | Running a CLI in the parent folder or connecting a local app to production. |
| 3    | First vertical slice → create a canvas document, paint, serialize, save a private project and reopen it.                                                         | The same editable layers and preview return after refresh.                                                                                                | Saving only the flattened preview and losing editable state.                |
| 4    | Account boundary → password signup/sign-in, profile creation, recovery-code setup and ownership checks.                                                          | A second user cannot read, modify or retrieve the first user's private project; recovery invalidates old credentials/session access.                      | Trusting a hidden UI control instead of server authorization.               |
| 5    | Durable saving → validate uploads, register private storage, enforce expected versions, preserve local conflicts and retain the latest 20 revisions.             | Interrupted/stale saves expose a useful retry or recovery path; restoring a version creates an observable new state.                                      | Marking a project saved before its cloud write has committed.               |
| 6    | AI adapter → reserve quota, run bounded generation/editing, record job outcome, compare and persist the user's keep/discard choice.                              | One authorized real result and one failure/expiry path leave the original safe; replaying a decision does not duplicate a layer.                          | Retrying automatically without understanding quota or provider billing.     |
| 7    | Practice progression → show current prompts and award one eligible completion per challenge/project.                                                             | Repeated completion does not farm XP; buying or generating images adds no XP.                                                                             | Equating XP or generated polish with drawing skill.                         |
| 8    | Showcase and conversation → copy only an approved preview to public artwork, then add search, likes, comments, following/activity, reports and blocks.           | Another account sees shared work but not private files; making it private withdraws the public copy; report review and blocking change actual visibility. | Publishing test content as if it were organic community activity.           |
| 9    | Device/accessibility pass → inspect real rendered layouts, keyboard focus, small screens, storage denial and interrupted connections.                            | Primary controls stay reachable; failure text explains the next action. Physical mouse/touch/stylus checks are recorded separately.                       | Treating a narrow desktop viewport as a full mobile drawing test.           |
| 10   | Release → run typecheck/lint/build, review secret handling, deploy the coupled backend/frontend pipeline, and smoke-test the deployed URL with bounded accounts. | The production URL serves the intended commit/backend, sign-in/save/reopen works there and test records are cleaned up.                                   | Claiming a successful local build or Git connection proves public delivery. |
| 11   | Recovery rehearsal → export database plus files, restore into a separate deployment, and rehearse compatible frontend/backend rollback.                          | A known private project and preview can be reopened after the rehearsal without public exposure.                                                          | Restoring production destructively as the first recovery test.              |
| 12   | Small pilot → observe consenting casual makers against their existing drawing-app/folder/group workflow.                                                         | Unprompted return, useful feedback and cost per useful session are measured.                                                                              | Treating compliments about a feature list as retention or purchases.        |

## Verification and release boundary

Implemented surfaces and source checks are visible in this repository. At writing, the development checks include a two-account backend suite reported as **21 checks**, separate quota guards, recovery tests, and inspected desktop/mobile screenshots. Two live OpenAI requests have succeeded; an additional browser image-edit flow is under final review. Counts can change with later test additions; the dated release evidence, not this paragraph, is the final record.

These results do not yet establish a fully accepted connected browser journey or verified public production availability. They also do not establish physical-device performance, long sessions, learning efficacy, accessibility conformance, community response time or demand. The production deployment and final acceptance review must be recorded separately once completed. Local `.frontend-craft/` evidence is intentionally ignored by Git and is not a public analytics or user-content dataset.

### MVP acceptance checklist

- [ ] A new guest can make marks and download a project backup.
- [ ] A signed-in maker can save, refresh, reopen and restore an editable project.
- [ ] A stale write or interrupted upload never silently destroys the competing copy.
- [ ] An AI proposal stays separate until accepted; discard and replay/reload are safe.
- [ ] Quota limits and unavailable/expired provider jobs have understandable outcomes.
- [ ] A second account cannot access private work; share/unshare changes actual public access.
- [ ] Comments, appreciation, follow/activity, report review and block/unblock affect real records.
- [ ] A saved recovery code works once, old codes stop working after rotation, and recovery revokes previous session access.
- [ ] Desktop keyboard and mobile viewport workflows pass; physical-device limitations are stated.
- [ ] Deployed URL, commit, backend and bounded production smoke evidence are recorded; backups and rollback are rehearsed.

The boxes define final acceptance and are intentionally not pre-checked by partial evidence. The most useful first action today is to complete and record the preservation/recovery spike, then the deployed save/reopen path.

## Small pilot, prepared but not run

Recruit 8–12 consenting adults who already draw casually; permission to send invitations is separate from this recipe. Compare one short project with a prompt plus their existing tool. Proposed internal thresholds: seven of ten finish/save without step-by-step help; four of ten return on three distinct days during two weeks without personal reminders; seven of ten opted-in feedback requests receive a response the author calls useful within a day. These are decision rules, not industry benchmarks.

Track manual and assisted sessions separately. Ask what feels like the maker's contribution, why a session stopped, what they currently pay for, and whether the existing workaround is easier. Investigate real purchases only after useful use and measured sustainable cost; no payment flow or paid demand has been validated. If completion or return is weak, revise the core session before adding more social features. The weakest business assumption remains voluntary return despite excellent free alternatives.
