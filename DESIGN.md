# OBD Dash design: Cluster

The source of truth for how OBD Dash looks. Tokens live in `app/globals.css`, components in `components/ui/` (usage in
[`docs/ui-kit.md`](docs/ui-kit.md)). Change this file first, then the code.

Chosen from three coded directions (screenshots in `docs/screenshots/redesign/directions/`). The user picked
**Cluster** and asked that it work in **portrait and landscape**, with **everything easy to reach**.

## 1. Theme and atmosphere

OBD Dash should feel like the car's own instrument cluster: warm graphite, one acid-lime accent, condensed bold
numerals. It's a tool used on a phone, often in a mount at arm's length, in daylight and at night.

- **Dark only.** No light mode. `color-scheme: dark`, theme colour `#0e0c09`.
- **Glanceable first.** The value is the biggest thing on screen. Labels are short. Nothing is decorative.
- **One accent.** Lime marks "this is the action" and "this is live/good". Amber and red mean vehicle state and
  nothing else.
- **Calm.** No glows, gradients, blur-as-decoration or idle animation.
- Dials: variance 3 (predictable, aligned), motion 2 (state changes only), density 5 (an app, not a cockpit).

## 2. Colour tokens (OKLCH)

Use the Tailwind names (`bg-surface-1`, `text-fg-muted`, `border-line`...), never raw colours. Contrast is measured on
`--bg`/`--surface-1`.

| Token | Tailwind | Value | Role | Contrast |
| --- | --- | --- | --- | --- |
| `--bg` | `bg-bg` | `oklch(0.155 0.006 70)` `#0e0c09` | Page, inputs | |
| `--surface-1` | `bg-surface-1` | `oklch(0.195 0.007 70)` | Panels, chip, sheet | |
| `--surface-2` | `bg-surface-2` | `oklch(0.24 0.008 70)` | Secondary buttons, selected nav, notes, gauge track | |
| `--surface-3` | `bg-surface-3` | `oklch(0.28 0.009 70)` | Hover on surface-2, selected segment | |
| `--line` | `border-line` | `oklch(0.31 0.009 70)` | Panel borders, dividers | |
| `--line-strong` | `border-line-strong` | `oklch(0.5 0.01 70)` | Control borders (inputs, secondary buttons) | 3:1 |
| `--fg` | `text-fg` | `oklch(0.96 0.005 80)` | Body text, values | 16.3:1 |
| `--fg-muted` | `text-fg-muted` | `oklch(0.78 0.01 75)` | Labels, secondary text | 9.1:1 |
| `--fg-faint` | `text-fg-faint` | `oklch(0.66 0.012 75)` | Units, hints, inactive tabs, placeholders | 5.9:1 |
| `--accent` | `bg-accent` / `text-accent` | `oklch(0.89 0.19 122)` `#c6ed47` | Primary action, active nav, focus ring, links | 13.7:1 |
| `--accent-hover` | `bg-accent-hover` | `oklch(0.93 0.17 122)` | Primary hover | |
| `--on-accent` | `text-on-accent` | `oklch(0.2 0.04 122)` | Text on accent | 13.4:1 on accent |
| `--ok` | `text-ok` | = accent | Connected, saved, healthy | |
| `--warn` | `text-warn` | `oklch(0.82 0.15 75)` | Caution: low fuel, reconnecting, notes | 10.3:1 |
| `--danger` | `bg-danger` | `oklch(0.7 0.19 27)` | Over limit, error, alert firing (fills, strokes) | 6.3:1 |
| `--danger-fg` | `text-danger-fg` | `oklch(0.78 0.13 27)` | Danger as small text | 8.7:1 |
| `--on-danger` | `text-on-danger` | `oklch(0.18 0.03 27)` | Text on danger fill | 6.5:1 |
| soft tints | `bg-accent-soft`, `bg-warn-soft`, `bg-danger-soft` | 14-16% `color-mix` | Badge and note backgrounds | |

Rules:
- Never put information in colour alone: pair it with a word ("High", "Low", "Connected") or a position.
- `ok` is the accent on purpose. A second green next to lime would read as two different meanings.
- No pure black or white except the sheet backdrop (`bg-black/70`).

**Transition remap.** Until every page is restyled, `app/globals.css` redefines Tailwind's `zinc-*` (warm graphite
ramp) and `sky-*` (lime ramp, `sky-600` darkened so old buttons keep 4.5:1 with light text). That is why pages not yet
restyled already look close. Remove the block once nothing uses `zinc-*` or `sky-*` (`grep -rE "(zinc|sky)-[0-9]" components app`).

## 3. Type

- **Archivo** (variable, with its width axis), self-hosted by `next/font` at build time: no runtime font request.
  - UI text: normal width. Body 16px (`text-base`), secondary 14px (`text-sm`). Nothing below 13px except badges (12px).
  - Headings: semibold/bold, tight tracking on the page h1 (`text-3xl font-bold tracking-tight`), panels `text-lg font-semibold`.
  - **Numbers: the `num` utility**: Archivo at 75% width, bold, `tabular-nums`. Use it for every live value,
    readout and count. Sizes: `text-3xl` (stat), `text-5xl` (hero stat), `text-7xl` (dashboard primary).
  - Wordmark: `OBD DASH`, uppercase, extrabold, 75% width.
- **Geist Mono** (`font-mono`) only for raw protocol text: AT commands, hex, UUIDs, the debug log.
- Sentence case everywhere (headings and buttons). No em or en dashes in UI copy; use a comma, colon or hyphen.
- Missing value: `--` (`NO_VALUE` from the kit), like a car display. The old `fmt()` in
  `components/dashboard/live.ts` returns an em dash; switch it to `NO_VALUE` when you restyle the dashboard.

## 4. Space, radius, elevation

- Spacing on Tailwind's 4px scale. Page padding `px-4` (phone), `md:px-6`. Gap between panels `gap-4`/`space-y-4`.
  Panel padding `p-4 sm:p-5`.
- **Radius (one rule, everywhere):** containers (panels, sheets, empty states) `rounded-panel` = 14px; controls
  (buttons, inputs, notes, chip, nav items) `rounded-control` = 10px; segments inside a control 6px; badges and
  status dots fully round.
- Elevation is surface lightness, not shadow: bg < surface-1 < surface-2 < surface-3. Shadows only on floating
  layers (toasts, alert popover): `shadow-xl shadow-black/40`.
- Z-index: header and tab bar/rail 40, popovers 50, toasts 60. Dialogs use the native top layer.

## 5. Components and states

All in `components/ui/`, documented in `docs/ui-kit.md`. Every interactive element is at least 44px tall
(`min-h-11`); in-car primary actions are 48px (`min-h-12`).

| State | Treatment |
| --- | --- |
| default | as specified per component |
| hover | one step lighter surface (`surface-2` to `surface-3`), or text `fg-muted` to `fg` |
| active (pressed) | `translate-y-px` on buttons, `bg-surface-1` on tabs |
| focus-visible | global 2px accent outline, 2px offset (`app/globals.css`). Never remove it |
| selected/current | `bg-surface-2 text-fg` plus a 3px accent bar (inset on the left in lists, on top of phone tabs) |
| disabled | `opacity-40`, no pointer events |
| error | `aria-invalid` gives a danger border; message below the field in `text-danger-fg`; `InlineNote tone="danger"` for non-field errors |
| loading | `Button loading` (disabled, `aria-busy`, trailing "…"); text labels end in "…" ("Reading…") |

Component notes:
- **Button**: `primary` (one per view, the next step), `secondary` (default), `ghost` (low-emphasis, inside panels),
  `danger` (destructive; also ask for confirmation). Default `type="button"`: pass `type="submit"` in forms.
- **Panel** is the only box. Don't nest panels; use `Disclosure variant="inset"` or a `border-line` group inside.
- **Disclosure** (native `<details>`) for long or rarely used sections. The summary row is 56px.
- **Sheet** for menus and short tasks (native modal dialog). Bottom sheet on a portrait phone, centred elsewhere.
- **Stat** for any big number with a unit. **Badge** for status words and counts (never clickable).
- **InlineNote** for messages inside the page. Toasts only for transient events (connection changes, alerts).
- Status dots are allowed only for real state (connection chip, saved folder).

## 6. Layout and responsive rules

Phone first. Three layouts, switched in CSS only:

| Screen | Navigation | Content |
| --- | --- | --- |
| Portrait phone (default) | Bottom tab bar: 4 primary tabs + More (sheet). 56px tall, above the home indicator | One column, `pb` for the bar |
| **Landscape phone** (`short:` variant = landscape and height ≤ 512px) | **Left rail** (96px): the same 4 tabs + More, stacked. No bottom bar | Two columns where a page has two groups; header 48px |
| `md` (768px+) and not short | Sidebar (224px) with every page | `max-w-6xl`, two columns from `lg` |

- Use the `short:` variant for landscape phones: it is defined in `app/globals.css` and wins over `md:`.
- Easy access: the primary action of a screen sits in the first column and near the top. On phones, primary buttons
  span the width (`grid gap-2 sm:grid-cols-2`). Never put a primary action only in the header.
- Respect safe areas: header and rail pad `env(safe-area-inset-left/right)`, bars pad `env(safe-area-inset-bottom)`.
- `html` has `scroll-padding-block: 4.5rem` so the sticky header and tab bar never hide a focused element.
- Dashboard landscape: everything must fit 844x390 without scrolling. Classic shows its 4 gauges in one row
  (`short:grid-cols-4`) and the theme toolbar shrinks to one line.

## 7. Motion

- Only state changes move: colour and background (150ms), button press (150ms), gauge value (250ms linear, already
  in `Gauge`). Pulse only on states that are actively changing (connecting, reconnecting, a fresh alert).
- No entrance animations, scroll effects or idle loops.
- `prefers-reduced-motion: reduce` collapses every animation and transition (global rule in `app/globals.css`).
- Transition explicit properties (`transition-colors`, `transition-[background-color,translate]`), never `all`.

## 8. Data visualisation (gauges and charts)

Thresholds come from `lib/dashboard/zones.ts` and settings. They are general guidance, not standards (README
`[verify]`). Colours map like this:

| Condition | Source | Token |
| --- | --- | --- |
| RPM at or above the redline | `useRedline()` (user setting) | danger |
| Shift lights start | `SHIFT_START` × redline (display choice) | ramp accent, then warn, then danger at the redline |
| Coolant at or above `COOLANT_HOT_C` | `zones.ts` (estimate) | danger |
| Fuel at or below `FUEL_LOW_PCT` | `zones.ts` (estimate) | warn |
| Normal value | | accent arc or `fg` needle |

- Gauge parts: track `var(--surface-2)`, ticks `var(--line-strong)` (labelled ticks `var(--fg-muted)`), value text
  `var(--fg)` in `num`, unit `var(--fg-faint)`, zone `var(--danger)`/`var(--warn)`. SVG takes `stroke="var(--danger)"`
  directly. Replace the hex literals in `components/dashboard/Gauge.tsx` and the `RED`/`AMBER` constants in the themes.
- Draw a zone as a thin ring outside the track so the value arc never hides it (direction mockups show this).
- In a zone: the value text turns the zone colour **and** a word appears ("High", "Low"). Colour alone is not enough.
- Charts: gridlines `var(--line)`, axis labels `var(--fg-faint)` 13px `num`. Series colours (`SERIES` in
  `components/dashboard/live.ts`) must avoid the warn and danger hues. Proposal to validate with the `dataviz` skill:
  lime `var(--accent)`, ice `oklch(0.78 0.11 230)`, orchid `oklch(0.74 0.14 320)`, `var(--fg-muted)`.

## 9. Do and don't

Do:
- Use kit components and token classes; reach for `buttonClass`/`linkClass` when a Link must look like one.
- Make the value the biggest thing; keep labels to one or two words.
- Check 390x844, 844x390 and 1280x800 every time.

Don't:
- Use raw colours (`zinc-*`, `sky-*`, `red-*`, hex) in new code.
- Add icons by hand-drawing SVG paths, or emoji as icons. No icon package is installed; text labels are the default.
- Centre everything, nest cards, add uppercase eyebrow labels above every heading, or animate for decoration.
- Put warn/danger colours on anything that isn't a vehicle or connection state.

## 10. Agent guide: restyling a page

1. Read this file and `docs/ui-kit.md`. Load the `design-taste-frontend` and `web-design-guidelines` skills.
2. Swap ad-hoc markup for the kit: `Panel`, `Button`, `Field` + `Input`/`Select`, `SegmentedControl` (for theme or
   unit pickers), `Stat`, `Badge`, `InlineNote`, `EmptyState`, `Disclosure`, `Sheet`.
3. Replace colour literals:

   | Old | New |
   | --- | --- |
   | `bg-zinc-950` | `bg-bg` |
   | `bg-zinc-900`, `rounded-lg border border-zinc-800 bg-zinc-900 p-4` | `Panel` / `panelClass` |
   | `bg-zinc-800`, `hover:bg-zinc-800` | `bg-surface-2`, `hover:bg-surface-2` |
   | `border-zinc-800` | `border-line` |
   | `border-zinc-600/700` (controls) | `border-line-strong` |
   | `text-zinc-100/200` | `text-fg` |
   | `text-zinc-300/400` | `text-fg-muted` |
   | `text-zinc-500` | `text-fg-faint` |
   | `bg-sky-600` button | `Button variant="primary"` |
   | `text-sky-300 underline` | `linkClass` |
   | `amber-*` | `warn` (`text-warn`, `bg-warn-soft`, `InlineNote tone="warn"`) |
   | `red-*` | `danger` (`bg-danger`, `text-danger-fg`, `bg-danger-soft`) |
   | `emerald-*` | `ok` |
   | `font-mono tabular-nums` on values | `num` |

4. Retire the old helpers on your page: `card`, `btn`, `btnPrimary`, `input`, `Field` from `components/garage/ui.tsx`
   (and the re-exports in `components/trips/ui.tsx`) now point at the kit; import from `@/components/ui` instead.
   When no page imports them, delete them and the transition `@theme` block in `app/globals.css`.
5. Add the landscape layout with `short:`. Don't change behaviour or data logic.
6. Run the `web-design-guidelines` audit on the files you touched; fix it or log an exception below.
7. Screenshots in Demo mode with `playwright-cli`: 390x844, 844x390 and 1280x800, into `docs/screenshots/<area>/`.

## 11. Audit exceptions

From the `web-design-guidelines` audit of the shell, connect screen, folder card and kit (JOID-0014):

- **Title Case**: the app uses sentence case for headings and buttons on purpose (easier to read at a glance).
- **Placeholders ending in "…"**: placeholders here are literal examples (`fff0`, `010C`) or a field name, not
  "type here" prompts.
- **URL reflects disclosure state**: sections deep-link by id instead (`#debug-console`, `#uuid-settings`).
- **Alert popover** (`AlertIndicator`): a non-modal popover without a focus trap, as before; Escape closes it while
  focus is inside. Kept to avoid changing behaviour.
- **Clear log** has no confirmation: it only clears the on-screen debug log; saved log files are untouched.
- **Header chip on phones** hides the protocol name below 640px; the Connect screen shows it in full.
- **Skip link** jumps to the page content (`#content`), not to each page's `<main>`.
- **Sheet backdrop** uses `bg-black/70` (pure black at 70%), the one place black is used.
