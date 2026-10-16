# Trips: trip computer, performance timer, trip log and replay, GPS route

`/trips` ("Trips" in the nav) is built on the live store and the polling API (`docs/dashboard.md`) and on the folder storage (`docs/storage.md`).

## Trip computer

- **Recording is automatic.** `startTripWatcher()` (`lib/store/trips.ts`) starts once from the app shell, so drives are recorded on any page. While the adapter is connected and **Auto-record** is on (default), it keeps polling running (`acquirePolling`). A trip starts on the first 010D reading above 0 km/h. It ends on disconnect (a reconnect keeps it open), or after the car has been stopped for the **stop timeout** (default 5 min, an app default you can change, 1–120 min).
- During a trip it calls `requestFast(["010D", "015E" or "0110"])`.
- **Distance**: trapezoidal integration of 010D over the reading timestamps (`lib/trips/calc.ts`). Readings more than 5 s apart (a dropout) aren't integrated across. **Moving** time covers intervals where either end is above 0 km/h, and **idle** covers the rest. **Average speed** is distance / moving time.
- **Fuel** (`lib/trips/fuel.ts`):
  - **015E** (engine fuel rate, L/h) is used as-is when the car reports it.
  - Otherwise, for **petrol** only, an **estimate** from MAF (0110): `L/h = g/s × 3600 / (AFR × density)`. AFR is 14.7:1 (commonly cited stoichiometric for petrol) and density is 745 g/L (inside EN 228's 720–775 kg/m³). Both are approximations `[verify]`. Ethanol blends and open-loop enrichment shift them. The UI labels the result **estimate**.
  - **Diesel or "other" without 015E**, or no Garage profile, shows **not available**. A diesel doesn't run at a fixed AFR, so a MAF number would mislead.
  - Instant economy is L/100 km while moving and L/h when stopped. Average economy is fuel used / distance (shown from 0.1 km). **Cost** is fuel used × the active profile's `fuelPrice`, in its `currency`. Imperial units show mi, mph, US gal and mpg (`lib/units.ts`).
  - Fuel type, price, currency and VIN come from the active Garage profile (`useGarage().activeProfile`).

## Performance timer

`lib/trips/perf.ts` (logic) and `lib/store/perf.ts` (state).

- **Hands-free.** **Arm** it while stopped. A run starts on the first moving reading after a 0 km/h one, and ends when the car stops again (or after 120 s, or a 5 s reading gap). Then it re-arms. Armed or running, it holds `requestFast(["010D"])`. Leaving the page disarms it.
- **Metrics**: 0–100 km/h, 0–60 mph (96.56064 km/h), quarter mile (402.336 m, the exact 1320 ft, with trap speed) and 100–0 km/h braking (the last fall through 100 km/h before the final stop, with braking distance). A run where the car accelerates past 100 km/h and then brakes to a stop gives all four.
- **Accuracy**: threshold crossings are linearly interpolated between readings, and quarter-mile distance is integrated the same way as trip distance. The start time is the last 0 km/h reading, which is conservative by up to one reading interval. OBD speed is whole km/h. The card shows the speed readings per second for each run. Accuracy is limited by the adapter's update rate `[verify]`.
- **Safety notice**: shown once before the first arm (`trips.perfNoticeSeen`).
- **Runs**: best per metric, plus the 20 most recent. They're saved to `trips/perf-runs.json` when the folder is ready, and re-read and merged before each write.
- **Demo mode**: the demo car never goes above 90 km/h, so a **Demo launch** button (Demo mode only, while armed) makes the simulator do one hard launch and brake (`lib/sim/trips.ts`). These are demo values, not a real car.

## Dyno

The power and torque estimate (a single-gear pull) sits under the performance timer. See [dyno.md](dyno.md).

## Trip files

In the linked folder (`lib/trips/files.ts`, `lib/trips/format.ts`):

```
trips/<YYYY-MM-DDTHH-mm-ssZ>_<VIN|NOVIN>.json   summary
trips/<YYYY-MM-DDTHH-mm-ssZ>_<VIN|NOVIN>.csv    samples
trips/perf-runs.json                            performance timer runs
```

The time is the trip's UTC start (`fileStamp()`). The VIN is the active Garage profile's, with only A–Z and 0–9 kept.

**Summary** (`.json`). The first five keys are the stable header:

```json
{
  "format": "obd-dash-trip", "version": 1,
  "startedAt": "2026-10-16T08:00:01.250Z", "endedAt": "2026-10-16T08:24:40.000Z", "vin": null,
  "durationS": 1479, "distanceKm": 18.2, "movingMs": 1203000, "idleMs": 276000,
  "fuelL": 1.31, "fuelSource": "015E",
  "columns": [{ "id": "010D", "name": "Vehicle speed", "unit": "km/h" }],
  "gps": false
}
```

`fuelSource` is `"015E"`, `"estimate"` (if any MAF-estimated flow went in) or `null`. The summary is written when the trip starts, with `endedAt: null`, and rewritten when it ends. A trip cut off by a crash or a closed tab is still listed, as "not finished".

**Samples** (`.csv`): one row per second, holding the latest value of every polled item, in raw metric registry units. A value older than 5 s is left empty.

```
time_iso,elapsed_s,0104,0105,…,010D,…,ATRV[,lat,lon,accuracy_m]
2026-10-16T08:00:01.250Z,0.1,18.4,37,…,12,…,14.1,59.329323,18.068581,7
```

Rows are streamed with `appendText` every 5 s, so a crash loses at most about 5 s. While the folder isn't ready, rows are buffered in memory. A trip that ended before a folder was chosen is written whole once one is.

**Without a folder** the trip computer still works live. The trip log says "Choose a folder to save trips" and shows the folder card. This session's last trip can still be replayed from memory (marked "not saved").

## Trip log and replay

- Lists `trips/*.json`, newest first. **Replay** loads the `.csv`. **Delete** asks for confirmation, then removes both files.
- Replay: a timeline scrubber (range input), the values of every recorded PID at the cursor, a speed + RPM chart, and a second chart for up to 4 other PIDs (chips). The charts are the dashboard's `LineChart`, with the whole trip as its window and a cursor line. Up to 800 points per series are drawn.

## GPS route

- **Opt-in, off by default** (`trips.gps`; anything but `true` in `settings.json` counts as off).
- When on: `navigator.geolocation.watchPosition` (feature-detected, high accuracy) only while a trip runs. Lat, lon and accuracy go into the CSV. A denied permission shows a toast and the trip is recorded without GPS. Other errors keep waiting for a fix.
- Replay draws the route as SVG (`lib/trips/route.ts`): an equirectangular projection around the mean latitude (mean Earth radius 6 371 008.8 m), north up, fitted to the box. The scale bar is a 1/2/5×10ᵏ m/km (or ft/mi) length, about ¼ of the width. Segments are coloured by speed or RPM over a 5-step ramp, with a cursor ring. **No map tiles and no network.**

## Settings (`lib/store/settings.ts`)

| Hook | Key | Default |
| --- | --- | --- |
| `useTripAutoRecord` | `trips.autoRecord` | `true` |
| `useTripStopMin` | `trips.stopTimeoutMin` | `5` (1–120, otherwise the default) |
| `useTripGps` | `trips.gps` | `false` |
| `usePerfNoticeSeen` | `trips.perfNoticeSeen` | `false` |

## Trade-offs

- With auto-record on, polling runs whenever the adapter is connected, so the connect screen's debug console (and `logs/`) show polling traffic. Turn auto-record off to avoid it.
- A trip ended by the stop timeout includes the stopped tail (up to the timeout) as idle time.

## Screenshots

`docs/screenshots/trips/`: Demo mode, 390px and desktop.
