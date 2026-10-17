<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design

`DESIGN.md` is the source of truth for how OBD Dash looks. Read it before touching any UI.

- Build with the tokens in `app/globals.css` and the UI kit in `components/ui/` (documented in `docs/ui-kit.md`). No raw colour literals or one-off button styles.
- Skills in `.claude/skills/` (attribution in `.claude/skills/NOTICE.md`): `design-taste-frontend` (direction and anti-template rules), `web-design-guidelines` (audit), `playwright-cli` (browser and screenshots), `image-to-code` (image-first mockups, needs an image model).
- After restyling an area, run the `web-design-guidelines` audit on its files and fix what it finds; log deliberate exceptions in `DESIGN.md`.
- Check every restyled screen with `playwright-cli` in Demo mode at 390px and at desktop width, and commit the screenshots under `docs/screenshots/`.
