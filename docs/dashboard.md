# Live dashboard (phase 3)

`/dashboard` shows live engine data in five themes. This page documents the polling Scheduler and the live store, which are the stable API that later features (trips, performance timer, alerts, custom dashboard) build on.

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

Wrap any multi-command or state-changing ELM operation in `withPollingPaused(fn)`. The Scheduler finishes its in-flight read, waits until all holds are released, then resumes.

## Scheduler (`lib/polling/Scheduler.ts`)

- On start it reads the supported-PID bitmasks (`discoverSupported`) and polls only registry PIDs the car supports, plus `ATRV`.
- **Fast** (RPM, speed, throttle, load, and anything promoted): polled back-to-back, round-robin.
- **Medium** (everything else, including `ATRV`): each one every 3 s.
- **Slow** (fuel level, baro, ambient): each one every 30 s.
- Each loop polls the most overdue medium/slow item if one is due, otherwise the next fast item. The tiers live in `TIERS`.
- A PID that answers `NO DATA` 3 times in a row is dropped for the session, because some ECUs advertise PIDs they never answer. 5 timeouts in a row raise one warning toast. A disconnect stops the Scheduler, and the glue restarts it on reconnect.
- The `ATRV` reading is mirrored into `useConnection`'s existing `voltage` field, so the shell's voltage stays current while polling runs.

In Demo mode the simulator manages about 35 to 45 Hz. A real BLE adapter will be much slower [verify].

## Units: `lib/units.ts` + `lib/store/settings.ts`

Each persisted setting has its own hook in `lib/store/settings.ts`, which returns `[value, set]`:

| Hook | Key | Default |
| --- | --- | --- |
| `useUnits()` (plain TS: `getUnits()`) | `units` | `"metric"` |
| `useTheme()` | `dashboard.theme` | `"classic"` |
| `useRedline()` | `dashboard.redlineRpm` | `6500` |
| `useHudMirror()` | `dashboard.hudMirror` | `false` |
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
| Classic | Needle gauges for RPM (red zone from the redline setting), speed, coolant (hot zone) and fuel (low zone). |
| Sport | Big tach with the speed in the middle, a shift-light bar (lights from 75 % of the redline, flashes at it), and coolant, throttle and fuel below. |
| Minimal | A card for every polled value, with a 60 s sparkline. |
| Engineer | A table of every polled PID with live, min, max and avg. A chart of up to 4 ticked PIDs, each drawn as a % of its own display range so they share one axis, with a hover tooltip showing real values. **Record** saves the session as CSV (`time_iso,elapsed_s,pid,name,value,unit`, raw metric units). |
| HUD | Huge speed, an RPM bar and coolant. **Mirror** flips it for windshield reflection. **Full screen** uses the Fullscreen API, and falls back to a full-window overlay where that's missing (iPhone). |
| Custom | Your own layouts of dial, number, bar and sparkline widgets. See [custom-dashboard-and-alerts.md](custom-dashboard-and-alerts.md). |

Warning thresholds are in `lib/dashboard/zones.ts`. They are general guidance, not from a standard: coolant hot at ≥ 110 °C and fuel low at ≤ 12 %. Redline is a per-car setting (default 6500 rpm, a placeholder).

## Screen and install

- **Wake Lock**: the dashboard keeps the screen on while it's open. This is feature-detected, re-acquired when the tab becomes visible again, and shown as "☀ screen on".
- **PWA**: `app/manifest.ts` (starts at `/dashboard`), icons in `public/icons/` (SVG source plus PNGs), and `public/sw.js`. The service worker is network-first with a cache fallback for same-origin GETs, so the installed app opens without signal. It is registered in production builds only.

Screenshots are in `docs/screenshots/dashboard/`.
