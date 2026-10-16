# Garage

`/garage`: car profiles, a per-car service log, maintenance reminders and a JSON backup. The whole Garage is **one file, `garage/garage.json`**, in the storage folder (see [storage.md](storage.md)): a real folder where the browser has a folder picker, otherwise the browser's private storage. There is no database. Nothing is sent anywhere, and reminders are in-app only (no push).

Screenshots: `docs/screenshots/garage/` (phone 390px and desktop).

## `useGarage` (`lib/store/garage.ts`): the API other features use

```ts
const { profiles, activeProfile, activeId, services, reminders, detectedVin } = useGarage();
```

| Field | Meaning |
| --- | --- |
| `profiles: CarProfile[]` | All cars. |
| `activeProfile: CarProfile \| null` | The selected car. Trips read `fuelType`, `fuelPrice`, `currency` and `vin` from here. |
| `activeId`, `loaded`, `error` | Selected id (remembered as `garage.activeId` in `settings.json`, see [storage.md](storage.md)), loaded flag, last storage error. |
| `readOnly` | `true` when `garage.json` couldn't be read or migrated: edits are refused (the data stays as it is on disk) until the file is fixed or a backup is imported. |
| `services`, `reminders` | All entries; filter by `carId`. |
| `detectedVin` | VIN read from the connected car that matches no profile (the UI offers to create one). |

Actions: `load` (re-reads the file; the "Try again" button), `saveProfile`, `deleteProfile` (cascades), `setActive`, `saveService`, `deleteService`, `saveReminder`, `deleteReminder`, `readOdometerFromCar`, `identifyCar`, `dismissDetectedVin`, `exportJson`, `importJson`. Helper: `blankProfile()`. Selector: `useGarageDueCount()`.

`CarProfile` (`lib/garage/model.ts`): `id, name, make, model, year, fuelType ("petrol"|"diesel"|"other"), fuelPrice (per litre, number|null), currency (free text, e.g. "SEK"), vin (uppercase|null), odometer, odometerUnit ("km"|"mi"), odometerAt, weightKg?` (curb weight in kg, number|null; optional, so files from before it existed still import. The dyno uses it, see [dyno.md](dyno.md)).

**Linking by VIN.** Scan history and trip logs should store the car's `vin` (not the profile `id`), then look the profile up with `findProfileByVin(profiles, vin)`. Profiles can be re-created or imported with new ids; the VIN stays stable.

Outside React: `useGarage.getState().activeProfile`. The app shell imports it (through the nav badge), so it is loaded app-wide.

## Auto-select

When the connection becomes `connected` (or is already connected when the store module loads), the store reads the VIN with `readVin` inside `withPollingPaused`, then switches to the matching profile or sets `detectedVin`. A failed VIN read (no Mode 09, link drop) is ignored and the selection stays. Because it starts when the module loads and the shell renders `<GarageNavBadge />` (below), it runs on every connect, not only after `/garage` was opened.

## Reminders

Due by date and/or odometer; the worse of the two wins. The odometer used is the larger of the profile's odometer and the latest logged service odometer. An unknown odometer never makes a reminder due.

- **Overdue**: date before today, or odometer at/past the mark.
- **Due soon**: within `DUE_SOON_DAYS = 30` days or `DUE_SOON_DISTANCE = 1000` (km or mi, per car).

These windows are app defaults, not manufacturer intervals, and no service intervals are prefilled. [verify] with the owner that these windows are what they want.

**Nav badge.** `lib/nav.ts` entries have no badge field, so `components/shell/NavLinks.tsx` renders `components/garage/GarageNavBadge.tsx` (the overdue + due-soon count) for `/garage`: beside the label in the sidebar, and in the tab's top-right corner on phones (beside the label it was cut off by the tab's `truncate`). Screenshots: `docs/screenshots/garage/nav-badge-*.png`.

## Odometer from the car

`readOdometer` (`lib/garage/odometer.ts`) checks the `01A0` support mask for PID `A6`, then reads `01A6` (4 bytes, 0.1 km/bit per SAE J1979 [verify]). Many cars don't report it, in which case the UI says so and the user enters it by hand. Demo mode answers both from `lib/sim/garage.ts` (84213.4 km, demo data).

## Backup format

`{ format: "obd-dash-garage", version: 1, exportedAt, profiles, services, reminders }`. Import validates the envelope, every field's type/enum, dates (`YYYY-MM-DD`), unique ids and VINs, and that every service/reminder points to a profile in the file, then **replaces** the whole garage after a confirmation. A malformed file is rejected with the reason and nothing changes.

## Storage: `garage/garage.json`

The file is the backup format above (`makeBackup` / `parseBackup`), written whole and atomically (`writeText`) after every change. Writes run one at a time in call order, so two quick edits can't interleave. `lib/garage/db.ts` has the file I/O, `lib/store/garage.ts` the logic.

- **Loading**: once the folder is `ready` (and again when a different folder is linked). Until then the Garage works in memory and the Garage page shows "Choose a folder to save your cars" with the folder card. Cars added in that time are merged into the file when the folder becomes ready (the file wins if an id clashes).
- **Changes are applied to the screen first**, then saved. If the save fails, the change stays in memory and `error` says "Couldn't save to your folder".
- **Malformed `garage.json`** (not JSON, wrong shape, bad dates, dangling references, ...): it is **never overwritten**. The store goes `readOnly`, the page shows the reason and a **Try again** button, and edits are refused. Fix the file and press Try again, or **Import JSON**: the unreadable text is first copied to `garage/garage-broken-<time>.json`, then the import replaces the file.
- **One-time migration from IndexedDB** (`lib/garage/legacy.ts`, the only IndexedDB code left; it opens the old `obd-dash-garage` database without creating it):
  - Old database has data and `garage.json` doesn't exist: write the file, **read it back, parse it and check the record counts match**, and only then delete the old database.
  - Any failure (write, read-back, count mismatch): the old database is untouched and the page is read-only with the reason. A partly written file is removed, so the migration runs again next time.
  - Both exist: **the file wins**. The old database is left alone and a line is logged to the console.
  - An empty old database is just deleted.
- **Known edge**: edits made in memory before the folder was ready are merged by id (additions only). Changing or deleting a car that is already in the file before the folder is ready is not carried over.
