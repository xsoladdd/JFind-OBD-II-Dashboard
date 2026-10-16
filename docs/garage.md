# Garage

`/garage`: car profiles, a per-car service log, maintenance reminders and a JSON backup. Everything is stored in this browser's IndexedDB (`obd-dash-garage`). Nothing is sent anywhere, and reminders are in-app only (no push).

Screenshots: `docs/screenshots/garage/` (phone 390px and desktop).

## `useGarage` (`lib/store/garage.ts`): the API other features use

```ts
const { profiles, activeProfile, activeId, services, reminders, detectedVin } = useGarage();
```

| Field | Meaning |
| --- | --- |
| `profiles: CarProfile[]` | All cars. |
| `activeProfile: CarProfile \| null` | The selected car. Trips read `fuelType`, `fuelPrice`, `currency` and `vin` from here. |
| `activeId`, `loaded`, `error` | Selected id (remembered as `garage.activeId` in `settings.json`, see [storage.md](storage.md)), IndexedDB loaded flag, last storage error. |
| `services`, `reminders` | All entries; filter by `carId`. |
| `detectedVin` | VIN read from the connected car that matches no profile (the UI offers to create one). |

Actions: `load`, `saveProfile`, `deleteProfile` (cascades), `setActive`, `saveService`, `deleteService`, `saveReminder`, `deleteReminder`, `readOdometerFromCar`, `identifyCar`, `dismissDetectedVin`, `exportJson`, `importJson`. Helper: `blankProfile()`. Selector: `useGarageDueCount()`.

`CarProfile` (`lib/garage/model.ts`): `id, name, make, model, year, fuelType ("petrol"|"diesel"|"other"), fuelPrice (per litre, number|null), currency (free text, e.g. "SEK"), vin (uppercase|null), odometer, odometerUnit ("km"|"mi"), odometerAt`.

**Linking by VIN.** Scan history and trip logs should store the car's `vin` (not the profile `id`), then look the profile up with `findProfileByVin(profiles, vin)`. Profiles can be re-created or imported with new ids; the VIN stays stable.

Outside React: `useGarage.getState().activeProfile`. The store only loads when a module imports it, so import `lib/store/garage` wherever you need it.

## Auto-select

When the connection becomes `connected` (or is already connected when the store module loads), the store reads the VIN with `readVin` inside `withPollingPaused`, then switches to the matching profile or sets `detectedVin`. A failed VIN read (no Mode 09, link drop) is ignored and the selection stays. Because it starts when the module loads, the Dashboard shell should render `<GarageNavBadge />` (see below) so it is loaded app-wide.

## Reminders

Due by date and/or odometer; the worse of the two wins. The odometer used is the larger of the profile's odometer and the latest logged service odometer. An unknown odometer never makes a reminder due.

- **Overdue**: date before today, or odometer at/past the mark.
- **Due soon**: within `DUE_SOON_DAYS = 30` days or `DUE_SOON_DISTANCE = 1000` (km or mi, per car).

These windows are app defaults, not manufacturer intervals, and no service intervals are prefilled. [verify] with the owner that these windows are what they want.

**Nav badge.** `lib/nav.ts` entries have no badge field, so `components/garage/GarageNavBadge.tsx` is a small component that shows the overdue + due-soon count. The app shell should render it beside the "Garage" label (`<GarageNavBadge />`).

## Odometer from the car

`readOdometer` (`lib/garage/odometer.ts`) checks the `01A0` support mask for PID `A6`, then reads `01A6` (4 bytes, 0.1 km/bit per SAE J1979 [verify]). Many cars don't report it, in which case the UI says so and the user enters it by hand. Demo mode answers both from `lib/sim/garage.ts` (84213.4 km, demo data).

## Backup format

`{ format: "obd-dash-garage", version: 1, exportedAt, profiles, services, reminders }`. Import validates the envelope, every field's type/enum, dates (`YYYY-MM-DD`), unique ids and VINs, and that every service/reminder points to a profile in the file, then **replaces** the whole garage after a confirmation. A malformed file is rejected with the reason and nothing changes.

## IndexedDB

`obd-dash-garage` v1: `profiles` (index `vin`), `services` (index `carId`), `reminders` (index `carId`), all with `keyPath: "id"`.
