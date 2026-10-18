# Live dashboard (phase 3)

`/dashboard` is the full-screen drive view: live engine data in seven layouts, with everything else behind one **Menu** button (driving rules in [DESIGN.md §12](../DESIGN.md#12-driving)). This page documents the polling Scheduler and the live store, which are the stable API that later features (trips, performance timer, alerts, custom dashboard) build on.

## Live data API

### Reading values: `lib/store/live.ts`

```ts
import { useLive, liveDef } from "@/lib/store/live";

// React, re-renders only when RPM changes:
const rpm = useLive((s) => s.values["010C"]?.value);

// Plain TypeScript (trips, alerts):
const { values, supported, hz, running } = useLive.getState();
const unsub = useLive.subscribe((s, prev) => { /* s.values[id] !== prev.values[id] → new reading */ });
```

| Field | Meaning |
| --- | --- |
| `values[id]` | `{ value, t, history, min, max, sum, count }` for each polled item. `value` is in raw registry units (metric, from `lib/obd/pids.ts`). `t` is `Date.now()` of the reading. `history` holds the last 60 s (at most 300 points), oldest first. `min`/`max`/`sum`/`count` cover the session. |
| `supported` | Item ids the Scheduler polls: the registry PIDs the car reports as supported, plus `"ATRV"` (adapter voltage). |
| `hz` | Completed reads per second (2 s window). |
| `running` | Whether the Scheduler is polling right now. |

Ids are the registry ids (`"010C"`), plus `"ATRV"`. `liveDef(id)` returns the name, unit and display range for either. The store is reset when a new connection starts and kept across a reconnect.

### Keeping polling running: `lib/polling/index.ts`

The Scheduler only runs while the adapter is connected **and** something needs live data, so the connect page's debug console isn't flooded with polling traffic.

```ts
import { usePolling, acquirePolling, requestFast } from "@/lib/polling";

usePolling();                    // React: poll while this component is mounted
usePolling(["010C", "010D"]);    // ...and poll these at fast priority

const release = acquirePolling(); // plain TS: poll until release()
const release = requestFast(["010D"]); // promote PIDs to fast (also keeps polling running) until release()
```

Calls are ref-counted, and `release()` is safe to call twice. Promotions survive reconnects. A performance timer would call `requestFast(["010D"])` while armed, for example.

### Pausing: `lib/polling/pause.ts`

Wrap any multi-command or state-changing ELM operation in `withPollingPaused(fn)`. `withPollingPaused` first waits for the Scheduler's in-flight custom-PID header group (ATSH, requests, restore) to finish, so `fn`'s first command never goes out on a custom header. A plain read is a single queued command and needs no wait. The Scheduler waits until all holds are released, then resumes.

## Scheduler (`lib/polling/Scheduler.ts`)

- On start it reads the supported-PID bitmasks (`discoverSupported`) and polls only registry PIDs the car supports, plus `ATRV`.
- **Fast** (RPM, speed, throttle, load, and anything promoted): polled back-to-back, round-robin.
- **Medium** (everything else, including `ATRV`): each one every 3 s, when the bus has room (below).
- **Slow** (fuel level, baro, ambient): each one every 30 s.
- **RPM (`LEAD`) gets every other request** while it's polled, so the needle keeps up when revving. The other requests
  alternate between the most overdue medium/slow item and the next other fast item, so neither tier starves the other.
  The tiers live in `TIERS`. With many supported PIDs a medium item can come round later than 3 s.
- Measured with the simulator at about 60 ms per reply (an ELM327-like rate, JOID-0019): RPM went from 1.3 to 8.2
  updates/s (mean gap 723 to 122 ms); speed and throttle stayed at about 1.3/s, and medium items slowed from every
  ~3 s to every ~8–10 s. The needle's CSS transition is 100 ms.
- A PID that answers `NO DATA` 3 times in a row is dropped for the session, because some ECUs advertise PIDs they never answer. 5 timeouts in a row raise one warning toast. A disconnect stops the Scheduler, and the glue restarts it on reconnect.
- The `ATRV` reading is mirrored into `useConnection`'s existing `voltage` field, so the shell's voltage stays current while polling runs.

In Demo mode the simulator manages about 35 to 45 Hz. A real BLE adapter will be much slower [verify].

## Units: `lib/units.ts` + `lib/store/settings.ts`

Each persisted setting has its own hook in `lib/store/settings.ts`, which returns `[value, set]`:

| Hook | Key | Default |
| --- | --- | --- |
| `useUnits()` (plain TS: `getUnits()`) | `units` | `"metric"` |
| `useTheme()` | `dashboard.theme` | `"drive"` |
| `useRedline()` | `dashboard.redlineRpm` | `6500` |
| `useHudMirror()` | `dashboard.hudMirror` | `false` |
| `useNightDim()` | `display.nightDim` | `false` |
| `useDriveExtras()` | `dashboard.driveExtras` | `["0105", "012F"]` (at most 2) |
| `useOpenAfterConnect()` | `drive.openAfterConnect` | `false` (set by Start driving) |
| `useLastAdapter()` / `setLastAdapter()` | `ble.lastAdapter` | none (`{ id, name }` of the last Bluetooth adapter) |
| `useCustomLayouts()` | `dashboard.customLayouts` | `{ active: "", layouts: [] }` |
| `useAlertRules()` | `alerts.rules` | `[]` |

They're backed by `lib/storage/settings.ts`: `settings.json` in the folder the user picks (see [storage.md](storage.md)).

Convert at display time:

```ts
import { toDisplay } from "@/lib/units";
import { getUnits } from "@/lib/store/settings";
toDisplay(100, "km/h", getUnits()); // { value: 62.14, unit: "mph" }
```

This covers km/h, km, °C, kPa, L, L/h and L/100km (to US mpg, US gallons). Units it doesn't know are returned unchanged. Store and export raw metric values, and convert only for display.

## Toasts: `lib/store/toasts.ts`

`toast.error(text)`, `toast.warn(text)`, `toast.info(text)` from anywhere. The shell renders them. Connection errors, drops, reconnects and "car didn't answer" are wired up in `watchConnection()`.

## Themes

| Theme | What it shows |
| --- | --- |
| Drive | Speed as the hero number, RPM as a full-width bar with the redline marked ("Redline" appears past it), and up to 2 values picked in the Menu (default coolant and fuel). Landscape puts speed on the left. In a small split-screen pane (`split:`) only speed and RPM stay. |
| Classic | Needle gauges for RPM (red zone from the redline setting), speed, coolant (hot zone) and fuel (low zone). RPM and speed full width in portrait, one row in landscape. |
| Sport | Big tach with the speed in the middle, a shift-light bar (lights from 75 % of the redline, flashes at it), and coolant, throttle and fuel below. |
| Minimal | A card for every polled value, with a 60 s sparkline. |
| Engineer (parked only) | A table of every polled PID with live, min, max and avg. A chart of up to 4 ticked PIDs, each drawn as a % of its own display range so they share one axis, with a hover tooltip showing real values. **Record** saves the session as CSV (`time_iso,elapsed_s,pid,name,value,unit`, raw metric units). |
| HUD | Huge speed, an RPM bar and coolant on pure black. **Mirror HUD** (Menu) flips it for windshield reflection. |
| Custom (default) | Your own layouts of dial, number, bar and sparkline widgets. View mode works while moving; picking, creating and editing layouts is in the Menu's "When parked" section, and the in-grid editing tools lock while moving. See [custom-dashboard-and-alerts.md](custom-dashboard-and-alerts.md). |

Every theme draws its zones from `zonesFor()` in `components/dashboard/live.ts`, and pairs the colour with a word ("High", "Low", "Redline"). Warning thresholds are in `lib/dashboard/zones.ts`. They are general guidance, not from a standard: coolant hot at ≥ 110 °C and fuel low at ≤ 12 %. Redline is a per-car setting (default 6500 rpm, a placeholder).

## Drive view

- **Shell**: the header, sidebar and tab bar are hidden on this page (the `drive:` CSS variant on `#drive-view`), but stay mounted, so alerts and trip recording keep running.
- **Menu** (one 72px button, bottom right; right edge in landscape) opens a sheet (`components/dashboard/DriveSettings.tsx`):
  - **Display**: layout, units, night dim, full screen, HUD mirror (HUD only), Hold parked (Demo only), and the screen-on and reads-per-second status.
  - **Go to**: every other page.
  - **When parked** (`StoppedOnly`): redline, the Drive layout's 2 values, and Custom layout management.
- **Alerts** (`components/dashboard/DriveBanners.tsx`): while a rule fires and alerts aren't muted, a full-width danger banner over the gauges shows the value at firing, its unit and "High"/"Low", with one 72px **Mute 5 min** (acknowledges and mutes, using the first of `MUTE_MINUTES`). Alert toasts are dismissed while it shows. The engine in `lib/alerts` and the shell's `AlertIndicator` are unchanged.
- **Connection**: nothing while it's fine. **Reconnecting** is a full-width warn banner with the gauges dimmed. Not connected or **Connection lost** replaces the gauges with the word and one big **Reconnect to <adapter>** (via `navigator.bluetooth.getDevices()`, feature-detected; README [verify]) or **Connect**, plus Demo mode. Connecting always starts from a tap.
- **Hold parked** (Demo): `lib/sim/park.ts` pins the simulated car at 0 km/h and idle, so the stopped (unlocked) state can be shown on demand.

## Screen and install

- **Wake Lock**: the dashboard keeps the screen on while it's open. This is feature-detected, re-acquired when the tab becomes visible again, and reported in the Menu ("Screen kept on").
- **Full screen**: a Menu switch, shown only where the Fullscreen API exists (not iPhone Safari, where the drive view already fills the window). Leaving the dashboard exits it.
- **PWA**: `app/manifest.ts` (starts at `/dashboard`), icons in `public/icons/` (SVG source plus PNGs), and `public/sw.js`. The service worker is network-first with a cache fallback for same-origin GETs, so the installed app opens without signal. It is registered in production builds only.

Screenshots are in `docs/screenshots/dashboard/`.
