# Code history (`/diagnostics`)

Follows each trouble code across the scans saved in `scans/*.json` (format: `lib/diagnostics/scanFile.ts`). It sits in a "Code history" card on `/diagnostics`; there is no nav entry. Everything is built on the device from the saved files. Nothing is uploaded.

## What it shows

One row per code and car: the code, its description (`describeDtc`), first and last seen, how many scans it was in, a **Came back after clear** flag and the current status. Open a row for the lists it was in over time (for example `pending → stored → stored+permanent`) and a timeline. Each event links to `/diagnostics?scan=<file name>`.

- **Car filter**: appears when more than one VIN is in the history. The label is the Garage profile name when `findProfileByVin` matches, otherwise the VIN. Scans without a VIN form their own "No VIN" group.
- **Export CSV**: one row per code for the cars shown (`obd-code-history.csv`: car, vin, code, description, first_seen, last_seen, times_seen, lists_over_time, times_cleared, came_back_after_clear, came_back_after_s, status, gone_since).
- **No folder / no scans**: the card explains that history is built from saved scans and links to the History page to choose a folder.
- **Skipped files**: damaged, wrong-version or foreign files in `scans/` are skipped and counted ("N files skipped"), never thrown.

## Rules (app logic, not from a standard) [verify]

- **Scans.** A read file is one scan. A clear file holds two: `before` and the re-read `after`. A `before` that is already in a read file (same VIN and timestamp) is counted once.
- **Times seen.** Number of distinct scans the code was in, on any list.
- **Cleared.** The scan before the clear had the code stored or pending, and the re-read has neither (and both lists were read).
- **Came back.** After a clear, a later scan has the code stored or pending again. A code that only stays on the permanent list after a clear has *not* come back. The latest return is shown, with the time since the clear.
- **Current status**, from the latest scan of that car: stored → *active*; else permanent → *permanent*; else pending → *pending*. Absent from a scan where all three lists were read → *gone* (since the first complete scan without it). Absent but a list read failed → *unknown*: a failed read is never treated as "no codes".

## Code

- `lib/diagnostics/history.ts`: `buildHistory` and `historyCsv` (pure), `loadScanFiles` (reads `scans/` with up to 8 reads in flight and a cache keyed by file name, size and `lastModified`; cache entries for deleted files are dropped). `lib/storage/folder.ts` runs file operations one at a time, so the cache is what keeps a few hundred scans fast, not the parallelism.
- `lib/store/codeHistory.ts`: the Zustand store. `components/diagnostics/CodeHistory.tsx`: the card, reloaded when the folder status changes or a scan is saved.

## Demo mode

`lib/sim/codeHistory.ts`: after a Mode 04 clear, **P0133 comes back as a pending code** from the second read after the clear on. (The re-read inside the clear run still shows nothing.) This is demo behaviour, not a real car's. To get a series: Demo mode → Read codes → Clear codes (switch off "simulated engine running") → Read codes again. P0133 shows *came back*, P0420 stays permanent, P0300 is gone.

## Tests

`lib/diagnostics/history.test.ts`: timeline, clears, came back, gone and unknown, VIN grouping, malformed files, cache, 300 files, CSV, and a read → clear → read series through the simulator.

Screenshots: `docs/screenshots/code-history/`.
