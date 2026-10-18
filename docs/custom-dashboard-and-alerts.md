# Custom dashboard and alerts

## Custom dashboard (`/dashboard` → **Custom**)

The 6th dashboard theme lets you build your own layouts. It is the **default theme** for now (JOID-0019, the user's
choice; DESIGN.md §11). On first run, with no saved layouts, it shows a **Starter** layout (`STARTER_LAYOUTS` in
`lib/dashboard/layouts.ts`): speed and gear, RPM as a full-width tall dial, coolant and fuel as bars. Editing it saves
it as your own.

- **Widgets**: dial gauge (`Gauge`), number, bar and sparkline (`Sparkline`). Each one can show any item the car supports (`useLive` `supported`), including `ATRV` and `GEAR` (below). Values follow the units toggle (`useDisplay`).
- **Warning zones**: these are the same zones Classic uses: RPM from the redline setting, coolant hot and fuel low from `lib/dashboard/zones.ts`. A widget takes the zone's colour and word when its value is inside a zone.
- **Sizes**: each tile is **Half** or **Full** width and **Normal** or **Tall** height, set separately. Stored as `size`
  `"1x1"` (half), `"2x1"` (full), `"1x2"` (half, tall) or `"2x2"` (full, tall), so layouts saved before JOID-0019
  (which only had 1x1, 2x1 and 2x2) need no migration. The grid is 2 columns wide in a narrow pane (portrait phone,
  every split-screen pane) and 4 from a 40rem wide pane (landscape phone, desktop), where Full spans 2 of the 4.
  Column count, row height (a third of the pane's height, half in 4 columns) and number sizes follow the pane
  (container queries), not the screen, so Android split screen next to Maps works.
- **Edit / view** (driving rules in [DESIGN.md §12](../DESIGN.md#12-driving)):
  - The layout picker and tools (New, Rename, Duplicate, Delete) and **Edit this layout** are in the dashboard Menu's "When parked" section.
  - Editing shows "Add widget" above the grid. **Tap a tile** to change it in the panel above: type, Width (Half /
    Full), Height (Normal / Tall), **Move up**, **Move down** and **Remove**. Each tile also has a **⠿ grip**: drag it
    (finger or mouse) onto another tile to move it there. The drag uses pointer events, because HTML5 drag-and-drop
    never fires for touch on Android. Move up / Move down are the keyboard and screen-reader way to reorder (the grip
    is hidden from them). While the car moves the editing tools are locked ("Available when stopped") and the widgets
    stay readable.
  - **Done** returns to view mode: just the widgets, for use in the car.
- **Several named layouts**: switch between them with the picker in the Menu.
- **Zones** show a word too ("High", "Low", "Redline"), not only a colour.
- **Code**: `lib/dashboard/layouts.ts` holds the pure layout operations and their tests. `components/dashboard/themes/Custom.tsx` is the UI.
- **Persisted** as `dashboard.customLayouts` through `useCustomLayouts()` in `lib/store/settings.ts`:

  ```json
  { "active": "<layout id>", "layouts": [{ "id": "…", "name": "Daily", "widgets": [{ "id": "…", "pid": "010C", "kind": "gauge", "size": "2x2" }] }] }
  ```

  A widget for an item this car doesn't report shows "not reported by this car" (for example when you open a layout made for another car).
  `settings.json` is hand-editable, so `sanitizeLayouts()` repairs what it reads instead of dropping a layout: an
  unknown kind becomes a number, an unknown size becomes half width, a missing id gets a new one.

### Gear (`GEAR`)

- **Reported by the car**: SAE J1979 PID **01A4** (transmission actual gear) exists on newer cars only. Supported-PID
  discovery now walks up to `01A0` so it can be found. Decoding (`lib/obd/pids.ts`): Wikipedia's J1979 table gives
  `[A1]` = ratio supported and ratio = (256C+D)/1000; A bit 0 = gear supported and gear = B bits 4–7 (0 = neutral,
  shown as **N**) comes from community captures, not the SAE text **[verify]** on a car that reports it.
- **Estimated otherwise** (`lib/dashboard/gear.ts`, glue in `lib/store/gear.ts`): in gear with the clutch engaged,
  rpm per km/h is fixed by the gearbox. Each speed reading (with the RPM read next to it) is a sample. Two samples in a
  row within 3 % (plus the ±0.5 km/h rounding) count as steady and join a cluster (within 10 %; clusters that drift within 10 % merge). A cluster with 8+
  samples is a gear; gears are numbered from the highest ratio (1st). A reading shows the nearest gear within 7 %
  (plus rounding), else nothing.
- **No value** when stopped or below 8 km/h, below 1000 rpm (idle, coasting in neutral), with the clutch in or
  mid-shift (the ratio matches no gear), and while learning (the tile says **learning**): until the learned gears
  span at least 3× (1st to top is about 3.5–5× in a car). Without that, the upper gears, which are learned first,
  would be numbered from 1. An estimate is marked **est.**
- **Per car**: learned clusters are saved as `gear.learned` (`{ [garage car id or "default"]: [{ ratio, n }] }`),
  at most every 10 s, so they survive restarts (localStorage, and `settings.json` when a folder is linked). The Menu's
  "When parked" section shows how many gears are known and has **Reset**.
- **Limits**: gear numbers start at the highest ratio *seen*. The 3× rule waits for 1st gear, but a gear skipped in
  the middle (never held steadily for 8+ readings) would shift the numbers above it until it is learned; Reset clears a
  bad start. CVTs have no fixed ratios and won't learn. Motorcycles (Detour) span less than 3× and would need a lower
  threshold. Automatics with a slipping torque converter
  learn slowly or not at all at low speed. Not tested on a real car yet.
- **Demo**: the simulator's car has five gears (`SIM_GEARS` in `lib/sim/engine.ts`) and doesn't report 01A4, so Demo
  shows the estimate: learning for the first minute or two, then gears.

## Alerts (`/alerts`)

- **Rules**: each rule watches any item in "above" or "below" mode and has these settings:
  - **Threshold**.
  - **Hysteresis**: once a rule fires, the value has to come back past `threshold ∓ hysteresis` before the alert clears, so it doesn't flap.
  - **Minimum duration**: the condition has to hold for that many seconds, measured on reading timestamps, before it fires, which ignores one-sample spikes.
  - **Enabled**.

  The form works in your units, and rules are stored in raw metric.
- **Persisted** as `alerts.rules` through `useAlertRules()` in `lib/store/settings.ts`. Each rule looks like `{ id, pid, op, threshold, hysteresis, durationS, enabled }`, in raw metric.
- **Examples**: coolant high, battery low and RPM at redline only **fill in the form**. They are labelled "adjust for your car", and every number is `[verify]`:
  - Coolant reuses the dashboard's estimate.
  - Battery low is a placeholder.
  - RPM uses your redline setting.

  Nothing runs until you save a rule.

### Engine (`lib/alerts/engine.ts`)

- **Where it runs**: `AlertIndicator` (in the shell header) calls `syncAlertEngine(rules, connected)` whenever the rules or the connection change, so alerts run on every page.
- **Polling**: while connected with at least one enabled rule, the engine holds one `acquirePolling()`. The Scheduler already polls every supported PID plus ATRV. The engine subscribes to `useLive` and evaluates each new reading (`evaluate` in `lib/alerts/rules.ts`).
- **Disconnect** (or no enabled rules): the engine releases polling, unsubscribes and clears the active alerts.
- **Side effect**: while a rule is enabled and the adapter is connected, polling runs even on the connect page, so the debug console shows that traffic.
- **When a rule fires**:
  - a warning toast;
  - two short Web Audio oscillator tones (`lib/alerts/sound.ts`, no audio files);
  - `navigator.vibrate`, when it exists (iOS has no Vibration API);
  - a red **⚠ n** chip in the header.

  The chip opens **Acknowledge** and **Mute 5/15/60 min**. Mute silences the toast, sound and vibration, but the chip still shows the alert.
- **Audio unlock**: browsers block audio until the user interacts with the page, so the shell arms the `AudioContext` on the first tap or key press (the Connect or Demo tap counts). Without that, alerts are silent but still show.

Screenshots: `docs/screenshots/custom-dashboard/`, `docs/screenshots/alerts/` (the header chip) and `docs/screenshots/redesign/alerts/` JOID-0019 added `custom-390`, `custom-desktop`, `custom-split-<w>x<h>` (split-screen panes), `custom-edit-*`, and `drive-`/`hud-`/`shell-trips-split-*` in the same folder.
(the page).

`/alerts` layout (DESIGN.md §12): a firing alert shows the Dashboard's danger banner with one 72px Mute; otherwise "No
alerts firing" or "Muted" in big type. Then 72px Mute 5/15/60 min (or Unmute). The rule list, the editor and the
examples are locked while moving.
