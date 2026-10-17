# Custom dashboard and alerts

## Custom dashboard (`/dashboard` → **Custom**)

The 6th dashboard theme lets you build your own layouts.

- **Widgets**: dial gauge (`Gauge`), number, bar and sparkline (`Sparkline`). Each one can show any item the car supports (`useLive` `supported`), including `ATRV`. Values follow the units toggle (`useDisplay`).
- **Warning zones**: these are the same zones Classic uses: RPM from the redline setting, coolant hot and fuel low from `lib/dashboard/zones.ts`. A widget takes the zone's colour and word when its value is inside a zone.
- **Sizes**: 1×1, 2×1 and 2×2, on a grid that is 2 columns wide on phones and 4 from `md`. The size button cycles through them.
- **Edit / view** (driving rules in [DESIGN.md §12](../DESIGN.md#12-driving)):
  - The layout picker and tools (New, Rename, Duplicate, Delete) and **Edit this layout** are in the dashboard Menu's "When parked" section.
  - Editing shows "Add widget" and per-widget controls: type, size, ↑/↓ and ✕. The ↑/↓ buttons work on phones and from the keyboard. On desktop you can also drag widgets to reorder them. While the car moves the editing tools are locked ("Available when stopped") and the widgets stay readable.
  - **Done** returns to view mode: just the widgets, for use in the car.
- **Several named layouts**: switch between them with the picker in the Menu.
- **Zones** show a word too ("High", "Low", "Redline"), not only a colour.
- **Code**: `lib/dashboard/layouts.ts` holds the pure layout operations and their tests. `components/dashboard/themes/Custom.tsx` is the UI.
- **Persisted** as `dashboard.customLayouts` through `useCustomLayouts()` in `lib/store/settings.ts`:

  ```json
  { "active": "<layout id>", "layouts": [{ "id": "…", "name": "Daily", "widgets": [{ "id": "…", "pid": "010C", "kind": "gauge", "size": "2x2" }] }] }
  ```

  A widget for an item this car doesn't report shows "not supported by this car" (for example when you open a layout made for another car).

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

Screenshots: `docs/screenshots/custom-dashboard/`, `docs/screenshots/alerts/` (the header chip) and `docs/screenshots/redesign/alerts/`
(the page).

`/alerts` layout (DESIGN.md §12): a firing alert shows the Dashboard's danger banner with one 72px Mute; otherwise "No
alerts firing" or "Muted" in big type. Then 72px Mute 5/15/60 min (or Unmute). The rule list, the editor and the
examples are locked while moving.
