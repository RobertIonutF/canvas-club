# Operating Canvas Club

Operator reference, checked against the current repository on 26 October 2026. These are instructions for authorized owners; no credential values belong in this document or command history. The initial Git-triggered production deployment reached `READY` and its public origin returned HTTP 200 without authentication. The bounded production browser journey passed signup, painting, saving/reopening, a real AI edit, sharing/conversation and history restoration; see the separate [verification record](BUILD.md#verification-and-release-boundary).

## Deployment map

| Environment            | Backend / ownership                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Development            | `formal-gopher-359` — `https://formal-gopher-359.eu-west-1.convex.cloud`                          |
| Production             | `impartial-ptarmigan-173` — `https://impartial-ptarmigan-173.eu-west-1.convex.cloud`              |
| Git source             | [RobertIonutF/canvas-club](https://github.com/RobertIonutF/canvas-club), production branch `main` |
| Frontend project       | Vercel `canvas-club-studio`, linked to that GitHub repository                                     |
| Public frontend origin | [Canvas Club](https://canvas-club-studio.vercel.app), also configured as production `SITE_URL`    |

Backend URLs and deployment names identify services; they are not secret credentials and do not establish a verified public frontend. Never substitute production for development to make a failing local test pass.

## Configuration and secrets

| Setting                                        | Where it belongs                                                    | Handling                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`                       | Local frontend / Vercel build                                       | Public client endpoint. Must target the intended environment.                                             |
| `NEXT_PUBLIC_CONVEX_SITE_URL`                  | Local frontend / Vercel environment                                 | Public Convex HTTP/auth endpoint for that environment.                                                    |
| `CONVEX_DEPLOYMENT`                            | Ignored local configuration                                         | Selects the owner's development deployment; check selection before CLI actions.                           |
| `OPENAI_API_KEY`                               | Approved ignored local destination, then Convex backend environment | Server-side only. It must never use a `NEXT_PUBLIC_` name or enter the browser bundle.                    |
| `SITE_URL`                                     | Convex backend environment                                          | Actual frontend origin, including the local port during development.                                      |
| `JWT_PRIVATE_KEY`, `JWKS`                      | Convex backend environment                                          | Auth signing configuration. Initialize once for a fresh deployment; preserve it during ordinary releases. |
| `AI_DAILY_USER_LIMIT`, `AI_DAILY_GLOBAL_LIMIT` | Convex backend environment                                          | Bounded positive integer limits; defaults 3 and 30.                                                       |
| `CONVEX_DEPLOY_KEY`                            | Vercel sensitive production environment variable                    | Production-scoped backend deploy credential; never expose it to the client or previews.                   |

`.env.local` and `.env.convex-production` are ignored. Do not print either file, grep for secret values, attach them to issues, or commit them. `.env.example` contains names only. [Next.js environment-variable guidance](https://nextjs.org/docs/app/guides/environment-variables) explains why public-prefixed values enter the browser.

Use the approved OpenAI Developers secure key workflow when provisioning or changing API credentials: explicit reuse/create decision, confirmed ignored local destination, secure provisioning, then verification without printing the value. Do not replace it with a request to paste a key into chat, a form, a command argument or a tracked file.

Once the approved local credential and intended backend are configured, this repository's helper reads the key locally and sends it over stdin; it logs variable names, not values:

```powershell
node scripts/configure-backend.mjs --site http://localhost:3028
```

For an authorized production origin update, use the same helper with `--prod --site <verified-frontend-origin>`, substituting the actual public HTTPS origin. The existing production authentication is already initialized. **Do not add `--init-auth` to an ordinary update:** it generates new signing material. Use that option only for a deliberate fresh-deployment setup or an explicitly reviewed key-rotation procedure.

The Vercel helper reads a previously provisioned production-scoped deploy key from the ignored `.env.convex-production`; it is scoped to this owner's existing Vercel project:

```powershell
npx.cmd --yes --package vercel node scripts/configure-vercel.mjs
```

It is not a general-purpose installer for another user's project. Do not dump its input file or write a key into the command. Access, scope and the approved destination must be established before running configuration helpers. If a secret is exposed, revoke/rotate it through its provider and update the approved destinations; deleting a Git line alone does not revoke a credential.

## Coupled GitHub → Vercel → Convex release

`vercel.json` selects `npm ci` and `node scripts/vercel-build.mjs`.

- On a production build, the helper requires `CONVEX_DEPLOY_KEY`, runs the pinned Convex CLI's production deploy with typechecking, then runs `npm run build`. Convex injects the production URL through `--cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL`.
- After the coupled production build succeeds, the helper initializes/advances the backend calendar through `calendar:rollover`. The daily midnight-UTC cron then advances the single calendar row used by reactive prompt, weekly-progress and quota-display queries. Mutations still enforce the actual server date. A missing calendar is a setup failure, not a reason to change a user's clock.
- On a nonproduction build, it runs only the Next.js build. It does not deploy backend code. Preview frontend variables must point to a deliberate nonproduction backend; do not grant previews the production deploy credential.
- `npm run build` by itself builds Next.js; it does not publish a site or deploy the backend.

Before merging/pushing an authorized production change, run typecheck, lint and build; inspect schema/auth/storage changes; verify that no ignored configuration or local QA artifacts are staged. Prefer backward-compatible backend changes because the backend deploy happens before the frontend build. A failed frontend build can leave newly deployed backend functions active.

After deployment, verify the public origin and expected commit, then perform a bounded production smoke: signup/sign-in, private save/reopen, export, one controlled share/unshare and account recovery where appropriate. Make a model request only when authorized and within budget. Remove clearly identified test records through the bounded owner workflow; never delete records based only on a common display name. Record observed behavior and unrun cases. A green build or linked repository is insufficient live verification.

For this release, the production backend has separately passed 21 integration checks, four quota guards and five storage/calendar boundary checks using bounded disposable accounts, with cleanup completed. Those checks made no provider calls. A separate production browser journey passed with exactly one paid image edit, preserved original layers, durable proposal recovery/acceptance, cloud save/reload, public sharing/conversation and history restoration. See the dated [verification record](BUILD.md#verification-and-release-boundary). A live backup-restore/rollback rehearsal has not been performed.

## AI budget, failures and provider access

The server defaults to three requests per artist and thirty across the deployment per **UTC day**. Limits are capped in source at 20/200. Quota is reserved atomically before provider work; failed, moderation-blocked, rejected or timed-out attempts may still count. It is an abuse/spend guard, not a guarantee of a fixed monetary bill or successful-image allowance. Do not increase it to troubleshoot account/model access.

The adapter makes one 1024×1024 low-quality PNG request per operation, with a provider timeout and bounded output reads. Current generation/edit models are configured in `convex/images.ts`. OpenAI errors become user-facing failure states; generated-art moderation is not moderation of the club's comments, profiles or manually uploaded work. [Official image documentation](https://developers.openai.com/api/docs/guides/image-generation).

Review numerical job usage, request IDs and terminal states without copying prompts, drawings, tokens or provider credentials into public logs. A pending job expires after five minutes through a scheduled operation; a retry is another explicit request. Keep the original draft and export route available. If provider access, billing or verification fails, inspect the owning OpenAI project and service status; do not silently switch accounts or models.

The current app has no operator UI kill switch or payment entitlement system. To stop billable generation during an incident, an authorized operator can disable/revoke the provider credential through the secure provider/configuration workflow; manual drawing should remain available. Do not set a quota variable to `0` expecting shutdown: invalid/nonpositive values fall back to defaults. Re-enable deliberately and verify one bounded operation.

## Human review of reports

`convex/moderation.ts` exposes **internal** operator functions. They are not web-client APIs. Public reports are queued; the app does not promise automatic review, instant removal, a response SLA or perfect enforcement.

List pending production reports from the project root using an authenticated owner CLI:

```powershell
npx.cmd convex run moderation:pending --prod
```

This output may include user content and a public preview URL. Keep it in an authorized review context rather than a public issue or analytics dump. The default batch is 25, bounded to 50.

Use the authenticated Convex dashboard's function runner or correctly structured CLI arguments for these internal operations; copy actual IDs from the pending result rather than inventing them:

| Function             | Required arguments                                                                    | Effect                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moderation:resolve` | `reportId`, `decision: "hide"` or `"dismiss"`, explanatory `note` (5–1000 characters) | Hide withdraws the public artwork/preview, marks the project private and restricts resharing. Dismiss retains the artwork and records the review outcome. |
| `moderation:release` | `projectId`, explanatory `note`                                                       | Clears the sharing restriction after a reviewed appeal/correction. It does not republish the artwork; the maker chooses whether to share again.           |

Review the actual work and report context before choosing an outcome. The private original remains the artist's project; public preview withdrawal and private project deletion are different actions. No public admin role is inferred from a client-supplied field. An operator must provide the practical support/review channel and staffing for a growing community; there is no outbound email delivery integration here.

## Project and account recovery

- **Device draft:** local IndexedDB holds recoverable state, subject to browser deletion, private-mode restrictions and device access. On a device-backup warning, download an editable project rather than assuming the browser retained it.
- **Cloud revisions:** the latest 20 versions are retained per project. Inspect the chosen revision and restore through the owner-authorized project flow; verify the reopened layer state afterward.
- **Concurrent tabs:** a save uses the expected cloud version. A conflict must preserve the local competing copy rather than silently overwrite the cloud version. Keep an exported copy before manually reconciling.
- **Removed project:** the collection's Recently removed view can restore a trashed project. This is different from an operator database restore and does not promise indefinite backup retention.
- **Recovery codes:** Settings requires current-password verification before generating six codes. New generation invalidates all older codes. Plain codes are returned once and held in the UI's memory; only hashes are stored server-side. Users explicitly download/save them. Do not photograph, log, solicit or impersonate a user's recovery code.
- **Forgotten password:** the recovery form requires the same email, one previously saved unused code, and a new 8–128-character password. Successful recovery invalidates old sessions. Without a valid saved code, email recovery is unavailable; do not claim that an operator can retrieve a password or plaintext codes.

## Backup and restore rehearsal

An editable user export protects one drawing. A deployment snapshot protects database state and, only when included, stored files. Neither replaces the other. The repository does not configure a recurring backup schedule; backup frequency, retention, encryption/access and restoration ownership remain operator decisions.

For an authorized production backup, run from the repository root with the intended project selected:

```powershell
$backupDirectory = Join-Path $env:LOCALAPPDATA 'CanvasClubBackups'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
npx.cmd convex export --prod --include-file-storage --path (Join-Path $backupDirectory 'canvas-club-snapshot.zip')
```

Choose a new unoccupied filename for each export. Backups contain private drawings and authentication-related records: keep them outside Git and shared folders. The example uses a per-user local application-data directory; substitute the operator's approved private backup location and retention controls.

First restore into an explicitly identified, isolated nonproduction deployment. The installed CLI supports `convex import <snapshot.zip> --deployment <isolated-name>`; import mode determines replacement/append behavior. Never run `--replace-all --prod` as a rehearsal. An actual destructive production restoration requires a reviewed incident procedure, a fresh pre-restore export, a write/publishing pause and explicit approval for its data replacement.

Rehearsal acceptance: reopen a known private project with editable layers, retrieve its preview, confirm another account is denied, verify a known public/withdrawn state and record any auth/session behavior. Do not send email or call image models merely to test snapshot import. File URLs, deletion semantics and auth behavior must be checked on the restored deployment rather than assumed. Official references: [export](https://docs.convex.dev/database/import-export/export), [import](https://docs.convex.dev/database/import-export/import).

## Rollback and incident recovery

1. Record the affected frontend deployment/commit and backend release, and preserve diagnostic request IDs without secret payloads.
2. Determine whether the fault concerns frontend code, backend behavior, data, provider access or a combination. Avoid destructive data actions for a UI-only failure.
3. A Vercel rollback/promote changes frontend routing; it does **not** undo Convex functions, schema or database writes. Check compatibility before sending traffic to an older frontend.
4. If backend code must change, review the known-good commit against current schema/data, create a corrective/revert commit and deploy a compatible backend/frontend release. Do not reset or overwrite user data just to match old code.
5. Restore data only under the separate reviewed restoration procedure above. Migrations and irreversible file deletion may need a forward repair instead of a code rollback.
6. Verify sign-in, private save/reopen, share/unshare, quota and account recovery at the actual production origin. Record what recovered and what remains unverified.

The backend integration smoke suite creates identifiable temporary accounts and uses bounded internal cleanup. Run it on development with operator CLI access, not on production. Its fixture jobs do not prove provider output; real image calls and browser acceptance have separate evidence. Never use internal QA seed/cleanup helpers against ordinary users or pass a user-selected arbitrary ID as a cleanup target.
