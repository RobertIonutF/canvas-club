# Canvas Club

A little space to draw, try an idea, and build a collection that feels yours.

Canvas Club is an early web app for casual makers: a useful solo painting session first, with optional AI help, creative projects, and a community around finished work. Creative XP records participation; it is not an art-skill score, and buying AI generations does not buy levels.

[Source repository](https://github.com/RobertIonutF/canvas-club) · [Build recipe](docs/BUILD.md) · [Operations](docs/OPERATIONS.md)

## What you can do

- Paint with a brush, eraser, fill, color picker, layers, undo/redo, pan and zoom.
- Start from a blank canvas or one of the club's original starter illustrations.
- Keep a device draft, save signed-in projects, revisit versions, export a PNG, or download an editable project backup.
- Generate a starting image or request an AI edit. Review the proposal before adding it; your existing layers remain available.
- Complete creative prompts, earn XP, and set a flexible weekly goal.
- Keep drawings private, pin favorites, and choose which pieces appear in your public showcase.
- Explore shared artwork, follow makers, appreciate work, and discuss a piece. Reporting and blocking are included; reports need operator review.
- Sign in with email and password. Create six single-use recovery codes in Settings after confirming your current password. Email recovery is not configured.

## Run locally

Use Node.js 20.9 or newer and npm. Dependencies are pinned in `package-lock.json`.

```powershell
npm ci
```

An operator must first connect an authorized development Convex deployment and configure its authentication. Use the existing approved OpenAI credential workflow and configuration helper for AI access; never put an OpenAI key in a public environment variable, source file, browser form, or commit. [Setup details](docs/OPERATIONS.md#configuration-and-secrets) explain the separate local, backend and deployment settings. `.env.example` documents variable names only.

With development configuration in place, run these in separate terminals from the repository root:

```powershell
npm run dev:backend
```

```powershell
npm run dev -- --port 3028
```

Open [localhost:3028](http://localhost:3028). Guest painting works before joining; account saving, community actions and AI requests require sign-in. Cloud features require the configured backend. Device drafts depend on that browser's storage and are not a replacement for an exported backup.

Checks:

```powershell
npm run typecheck
npm run lint
npm run build
```

`npm run test:backend` exercises the development backend using temporary QA accounts. It requires authenticated operator CLI access for bounded cleanup and must not be pointed at production. It does not call an image model. See the [verification boundary](docs/BUILD.md#verification-and-release-boundary).

## Current beta limits

| Resource                          | Limit                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- |
| Editor canvas                     | Up to 1024 pixels on either edge                                       |
| Painting layers                   | 8                                                                      |
| Cloud project snapshot / preview  | 40 MiB / 3 MiB                                                         |
| Saved versions                    | Latest 20 per project                                                  |
| Projects                          | 100 per artist, with a daily creation guard                            |
| Registered private file allowance | 250 MiB per artist, also bounded by file count                         |
| AI requests                       | Default 3 per artist per UTC day, 30 across the deployment per UTC day |

AI quota is reserved before calling the provider. Failed, rejected or timed-out provider attempts can still consume an allowance; it is not a promise of three successful images. The operator can change bounded server-side limits. Generation latency and exact output fidelity vary. This is asynchronous image assistance, not live per-stroke generation.

## Release status

As of 26 October 2026, local interface checks and development-backend checks have been performed, including real image-generation requests. The final connected browser workflow and public production deployment are still under release review. Repository creation and a linked Vercel project do not establish a verified live site. See [BUILD.md](docs/BUILD.md) for the evidence boundary and [OPERATIONS.md](docs/OPERATIONS.md) for deployment and recovery.

## Credits and licensing

The six starter SVG illustrations were created for Canvas Club and are labeled as starters, rather than community posts. The project began from the Convex Next.js / Convex Auth starter and includes maintained third-party packages and UI primitives; those packages retain their respective licenses. No repository-wide open-source license has been selected. A public GitHub repository alone does not grant a blanket reuse license.
