# OBD Dash design: Cluster

The source of truth for how OBD Dash looks. Tokens live in `app/globals.css`, components in `components/ui/` (usage in
[`docs/ui-kit.md`](docs/ui-kit.md)). Change this file first, then the code.

For anything used while the car moves, **§12 Driving** comes first.

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
- Missing value: `--` (`NO_VALUE` from the kit), like a car display. `fmt()` in `components/dashboard/live.ts`
  returns it too.

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
(`min-h-11`); in-car primary actions are 48px (`min-h-12`). Anything a driver may tap while moving is 72px
(`size="drive"`, see §12).

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
- Dashboard landscape: everything must fit 844x390 without scrolling. The dashboard is the full-screen drive view
  (§12): Classic shows its 4 gauges in one row (`short:grid-cols-4`), Drive puts speed on the left.

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
  directly. Zones come from `zonesFor()` in `components/dashboard/live.ts`, each with its tone and word.
- Draw a zone as a thin ring outside the track so the value arc never hides it (direction mockups show this).
- In a zone: the value text turns the zone colour **and** a word appears ("High", "Low"). Colour alone is not enough.
- Charts: gridlines `var(--line)`, axis labels `var(--fg-faint)` 13px `num`. Series colours are the tokens
  `--series-1..4` (`SERIES` in `components/dashboard/live.ts`), in this fixed order, clear of the warn and danger hues:

  | Token | Value | |
  | --- | --- | --- |
  | `--series-1` | `oklch(0.665 0.15 125)` `#7fa32a` | lime |
  | `--series-2` | `oklch(0.665 0.12 225)` `#1ea2cb` | cyan |
  | `--series-3` | `oklch(0.56 0.18 270)` `#4d68dc` | blue |
  | `--series-4` | `oklch(0.56 0.15 325)` `#9f51a4` | purple |

  Checked with the `dataviz` skill's validator (`--mode dark --pairs all`) on `--surface-1` and on the night-dim
  surface: all checks pass (worst colour-blind pair ΔE 9.3, normal-vision floor 15.5, all at least 3:1). The earlier
  proposal (accent lime, ice, orchid, `fg-muted`) failed it: too light, a grey slot, and ice and orchid merge for
  deuteranopes. Series are always named in a legend as well.

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
   now point at the kit; import from `@/components/ui` instead (`num`/`str` live in `lib/garage/model.ts`;
   `components/trips/ui.tsx` is gone, its formatters are in `components/trips/format.ts`).
   When no page imports them, delete them and the transition `@theme` block in `app/globals.css`.
5. Add the landscape layout with `short:`. Don't change behaviour or data logic.
   Apply §12 "Restructure, don't just recolour": put the driving-relevant item first, move secondary things behind a
   button or a sheet, and wrap typing and careful reading in `StoppedOnly`.
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

From JOID-0016 (driving):

- **HUD background is pure black** (`bg-black`): on a windshield reflection black shows nothing, so only the values
  appear. It's the HUD theme only.
- **Engineer table checkboxes** are 20px inside dense rows. Engineer is parking-only (`StoppedOnly`), so this never
  applies while moving.
- **Sheet "Close" is 44px**, not 72px, in the drive view's Menu: tapping the backdrop or pressing Escape also closes
  it, and closing can't change anything.
- **Theme and units in the Menu sheet are one tap** once the sheet is open: opening the sheet is the deliberate first
  step (§12 rule 5).

From JOID-0017 (Diagnostics, code history, ECU, History):

- **Print report is black on white** (`text-black`, `bg-white`, `border-black/30`): it is paper output, shown only by
  `window.print()`, never on screen.
- **ClearDialog is its own `<dialog>`, not a `Sheet`**: it must refuse Escape while clearing is in progress, which
  `Sheet` doesn't offer. It uses the sheet's surface, border and backdrop.
- **Code type, History tab and opened disclosures aren't in the URL**: the same reasoning as above; a saved scan does
  deep-link (`/diagnostics?scan=<file>`).
- **Code-type segments squeeze to 3 columns** on the Diagnostics page (`grid-cols-3!`, `[&>button]:px-1`) so Stored,
  Pending and Permanent stay on one row at 390px; they keep the 72px height.
- **Delete in History still uses `confirm()`**, as before: the file sheet is the deliberate first step and the
  browser's confirmation the second.

From JOID-0018 (Trips, Garage, Alerts, PIDs):

- **Route colour ramp** (`RAMP` in `lib/trips/route.ts`) stays raw hex: a sequential low-to-high scale for the replay
  route, always labelled with its min and max. It isn't vehicle state, and it doesn't step down with night dim.
- **Folder card inside the Trip log disclosure** is a panel inside a panel: `FolderCard` is shared and boxed. Parking-only.
- **Reminder and service dates** show as `YYYY-MM-DD`, the form the date field stores and edits them in.
- **Row actions are 44px** (Edit, Delete, Test once) on Garage reminders, alert rules and custom PIDs. The rule and
  PID lists are parking-only; on Garage, Delete asks for confirmation and Edit opens a locked form.
- **Timer Arm below the fold on phones**: the live trip figures come first, so the timer's Arm is one scroll down in
  portrait and just under the fold in the second column at 844x390. Arming is done before setting off.
- **Field names** in car, reminder, service, rule and PID forms are local identifiers with `autocomplete="off"`:
  browser autofill has nothing useful to offer for them.

## 12. Driving

OBD Dash is mostly used on a phone in a mount at arm's length, in portrait or landscape. Where a screen can be used
while the car moves, the rules here come first, before the rest of this file. The user's brief: "The colours look
good, but this is hard to use when you're driving."

### Principles

1. **Glance, don't read.** The usual reference is NHTSA's *Visual-Manual Driver Distraction Guidelines for In-Vehicle
   Electronic Devices*: single glances of about 2 s or less, and about 12 s or less of total eyes-off-road time per
   task [verify]. It is written for built-in car systems; here it is a design target, not a compliance claim.
   - Huge numbers, one word for state ("High", "Low", "Redline", "Reconnecting"), no paragraphs.
   - No small labels in the drive view: labels are 18px (`text-lg`) or more, one or two words (`shortName()`).
2. **Few, huge targets.** Drive-context targets are at least **72px** (`min-h-18`) with at least **16px** (`gap-4`)
   between them, so a bump doesn't hit the wrong one. These are app choices, not from a standard. Use
   `Button size="drive"`, `buttonClass(variant, "drive")` and `SegmentedControl size="drive"`; give a `Switch` that
   is used while moving `className="min-h-18"`. 44px stays the floor everywhere else.
3. **Nothing to type while moving.** Typing and careful reading are for when the car is stopped: wrap them in
   `StoppedOnly`.
4. **Zero setup in the car.** From opening the app to values on screen is one tap: the PWA opens on `/dashboard`,
   and its not-connected screen has one big **Reconnect to <adapter>** (no chooser, where the browser allows it) or
   **Connect** button. "Start driving" on the connect screen opens the drive view and makes later connects land there.
5. **No accidental exits or changes.** A mode change or an exit in the drive view takes two deliberate steps (open the
   Menu sheet, then choose) or a confirmation. Anything destructive asks for confirmation. Never a single stray tap.

### Moving or stopped: `useDriving` and `StoppedOnly`

- `useDriving()` (`lib/drive/driving.ts`) is true while connected and the last live vehicle speed (`010D`) is above
  0. The pure `isDriving(status, speedKmh)` is the testable part. There is no staleness timeout: a polling pause (an
  ECU test, a scan) must not unlock a form mid-drive.
- `StoppedOnly` (`components/ui`, see `docs/ui-kit.md`) swaps its children for a large "Available when stopped"
  panel while driving. The children stay mounted (hidden and inert), so a half-typed form survives rolling forward at
  the lights. It also keeps `010D` polled while it is on screen. Give it a `label` that names what is locked.
- **Lock:** anything that needs typing (forms, editors, name prompts), careful reading (tables, logs, raw protocol
  text, long explanations) or a multi-step operation (tests, setup).
- **Keep:** read-only glanceable values, the page's one big action, navigation.
- Safety interlocks in the logic stay: clearing codes is refused while RPM > 0 (`lib/diagnostics/scan.ts`).
- Demo mode: the simulator moves 10 to 50 s of every 60 s cycle. **Hold parked** in the dashboard Menu (Demo only,
  `lib/sim/park.ts`) pins it at a standstill.

### Restructure, don't just recolour

Restyling a page for driving means changing what is on it and in what order, not only its colours. For each page,
in this order:

1. **What goes first.** Name the one thing a driver needs from this page: a number, a status word, or one action.
   It is the first thing in the first column, at the top: a `Stat` at `lg`/`xl`, a word in a `Badge` or heading, or
   one `size="drive"` primary button. Nothing above it but the page title.
2. **What moves behind a button or a sheet.** Settings, filters, pickers, import/export, secondary actions,
   explanations and help text, and long lists past the first few items. Rarely used sections go in a `Disclosure`
   (stays on the page); a short task goes in a `Sheet` opened by one labelled button. One sheet per job, not a menu
   of menus.
3. **What is locked or removed while driving.** Everything in the "Lock" list above goes in `StoppedOnly`. Text
   that only explains stays for parked use, below the primary content. Decoration that adds nothing goes.

Checklist per page:

- [ ] The first item is the one driving-relevant thing, big, at the top of column one.
- [ ] Every control a driver might use while moving is `size="drive"` with `gap-4` around it.
- [ ] Every form, editor, table, log and multi-step tool is inside `StoppedOnly` with a `label`.
- [ ] Secondary actions and settings are behind one button (a `Sheet`) or in a `Disclosure`.
- [ ] Destructive and mode-changing actions need a confirmation or a second step.
- [ ] State is a word plus a colour, never colour alone.
- [ ] It works at 390x844, 844x390 (`short:`) and 1280x800, with the Demo car moving and held parked.

Starting points for the pages still to restyle. These are suggestions to confirm with the user, not requirements:

| Page | Goes first | Behind a button or sheet | Locked while driving (already done) |
| --- | --- | --- | --- |
| Diagnostics (done) | Code count as a word ("No codes", "3 codes"), the check-engine light, one 72px Read codes | Readiness, export and report, saved scans, code history, scan details (disclosures) | Freeze frame, code history, Clear codes (also RPM-blocked) |
| Trips (done) | The recorder state word, trip time and distance; the timer and dyno each with one 72px Arm | Trip settings (sheet), trip log and replay, timer accuracy, dyno charts, inputs and runs (disclosures) | Trip log and replay, settings, recent runs, dyno inputs, charts and runs |
| Garage (done) | The active car: odometer and the next due reminder | Car switcher (sheet), service log, backup and import (disclosures) | Car, service and reminder forms, service log |
| ECU (done) | Adapter voltage | Each test in its own disclosure, its last result in the summary | All four tests (Mode 06, per module, vehicle info, battery) |
| Alerts (done) | Firing alert banner (as on the Dashboard), else "No alerts firing"/"Muted", then 72px Mute 5/15/60 or Unmute | Examples (disclosure), explanation at the bottom | Rule list and rule editor |
| History (done) | Folder status, then scans or logs newest first | A file's actions and log viewer in a sheet | Log viewer |
| PIDs (done) | Parking-only: the list, New custom PID in the page header | Import and export, the Demo example (disclosures) | PID editor and list |

**Worked example: the Dashboard.**
1. First: the gauges, and nothing else. In the Drive layout that is speed as the hero, RPM as a full-width bar
   with the redline marked, and up to 2 values the user picks.
2. Behind one **Menu** button (72px, bottom right; on the right edge in landscape), in one `Sheet`: the layout picker,
   units, night dim, full screen, HUD mirror, Demo hold parked, the screen-on and reads-per-second status, and links to
   every page.
3. Locked: the redline input, the Drive value pickers and Custom layout editing (the sheet's "When parked" section),
   plus the Engineer table.
4. Trouble gets big: a firing alert is a full-width danger banner over the gauges (name, value, "High"/"Low") with
   one 72px Mute; "Reconnecting" is a full-width warn banner with the gauges dimmed; a lost link replaces the gauges
   with "Connection lost" and one big Reconnect. When the link is fine, nothing is shown.

### The drive view

- `/dashboard` renders `<main id="drive-view">`. The `drive:` variant (`app/globals.css`, `body:has(#drive-view)`
  while it isn't hidden) hides the shell's header, sidebar and tab bar at every width. They stay mounted, so the alert
  engine and the trip watcher keep running. With `cacheComponents`, a page you navigate away from stays in the DOM
  with an inline `display: none !important`; the variant ignores a drive view hidden that way. Don't reuse the id.
- The view fills the window (`fixed inset-0`) and pads every edge with `max(1rem, env(safe-area-inset-*))`.
- Layouts: Drive (default for new installs), Classic, Sport, HUD, Minimal and Custom (view mode) work while moving.
  Engineer and Custom editing are parking-only.
- The screen stays on (Wake Lock) while the dashboard is open. Full screen is a switch in the Menu where the
  Fullscreen API exists.

### Driving tab bar

While `useDriving()` is true, the phone tab bar (portrait) and rail (landscape) show only **Dashboard**, **Trips**
and **More**, at 72px, with 18px labels; More lists every other page. The desktop sidebar doesn't change. The list is
`DRIVE_TABS` in `components/shell/NavLinks.tsx`. Tabs stay text-only: no icon package is installed (adding
`@phosphor-icons/react` needs the user's approval).

### Night dim

**Night dim** in the Menu (setting `display.nightDim`) sets `data-dim` on `<html>`: the same palette at lower
luminance, app-wide (`:root[data-dim]` in `app/globals.css`). Body text drops from about 88% to about 51% relative
luminance. Contrast on the dim `--surface-1`:

| Token | Day | Dim | Dim contrast |
| --- | --- | --- | --- |
| `--fg` | `oklch(0.96 0.005 80)` | `oklch(0.8 0.005 80)` | 10.3:1 |
| `--fg-muted` | `oklch(0.78 0.01 75)` | `oklch(0.68 0.008 75)` | 6.7:1 |
| `--fg-faint` | `oklch(0.66 0.012 75)` | `oklch(0.58 0.01 75)` | 4.5:1 |
| `--accent` | `oklch(0.89 0.19 122)` | `oklch(0.74 0.15 122)` | 8.6:1 (`--on-accent` on it 8.7:1) |
| `--warn` | `oklch(0.82 0.15 75)` | `oklch(0.7 0.12 75)` | 7.1:1 |
| `--danger` | `oklch(0.7 0.19 27)` | `oklch(0.6 0.16 27)` | 4.5:1 (`--on-danger` on it 4.7:1) |
| `--danger-fg` | `oklch(0.78 0.13 27)` | `oklch(0.68 0.11 27)` | 6.4:1 |
| `--line-strong` | `oklch(0.5 0.01 70)` | `oklch(0.49 0.01 70)` | 3.1:1 |

Surfaces also step down (`--bg` 0.13, `--surface-1` 0.165, `--surface-2` 0.205, `--surface-3` 0.24, `--line` 0.27).
The chart series tokens pass on the dim surface unchanged.
