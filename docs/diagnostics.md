# Diagnostics (`/diagnostics`)

Reads trouble codes, the freeze frame, readiness monitors and the VIN, clears codes safely, exports a report and keeps a scan history on the device. Everything runs in the browser. Nothing is uploaded.

## What one scan reads

The whole scan runs inside `withPollingPaused` (`lib/polling/pause.ts`), so the live dashboard stops polling while it runs.

| Step | Request | Notes |
| --- | --- | --- |
| MIL, DTC count, readiness since clear | `0101` | Replies from several ECUs are combined (see below) |
| Readiness this drive cycle | `0141` | NO DATA → "not available" |
| Stored / pending / permanent codes | `03`, `07`, `0A` | `readDtcs`; NO DATA → none (older cars may not support `0A`) |
| VIN | `0902` | `readVin`; NO DATA → "not reported" |
| Freeze frame | `0200`(`0220`, `0240`) → `020200` → `02<pid>00` | Frame 0 only; values decoded through the Mode 01 PID registry (metric units) |

Each step is caught on its own. A failed step is stored as `null` with a message in `errors`, so "couldn't read" never shows as "no codes". NO DATA counts as "not supported". A dropped link aborts the scan.

Code: `lib/diagnostics/scan.ts` (`readScan`, `readFreezeFrame`, `clearCodes`), `lib/diagnostics/readiness.ts`, the state in `lib/store/diagnostics.ts`, and the UI in `components/diagnostics/`.

## Clearing codes (Mode 04)

1. **Clear codes…** is enabled only after a live read in this session.
2. A confirmation dialog explains:
   - clearing erases stored and pending codes and their freeze-frame data;
   - it turns off the check-engine light;
   - it resets the readiness monitors, so the car may fail an emissions inspection until they complete again;
   - permanent (Mode 0A) codes can't be cleared this way.

   The dialog has JSON / CSV / Print export buttons, and tells the user to set key ON, engine OFF.
3. `clearCodes` holds one polling pause for the whole flow:
   - It reads `010C` right before clearing. **RPM > 0 → blocked.** If RPM can't be read → blocked too, with the reason shown. `04` is never sent when blocked.
   - Otherwise it sends `04` (`clearDtcs`), then re-reads everything automatically.
4. The result shows either success or "codes returned/persisting" (listing the stored/pending codes still present). Permanent codes still present are listed separately, as expected. The re-read is saved to history, flagged "after clear".

In Demo mode the dialog has a **"Demo: simulated engine running"** checkbox, because the simulated engine never idles below 600 rpm. Untick it to put the simulated car at key ON / engine OFF.

## Readiness monitors

The bit layout follows SAE J1979 Service 01 PID 01, as tabulated in Wikipedia's "OBD-II PIDs" article, which cites J1979:

- A7 = MIL, A6–A0 = number of confirmed DTCs.
- B3 = ignition type (0 spark, 1 compression). B0–B2 = misfire / fuel system / components available; B4–B6 = the same tests incomplete.
- C = engine-specific monitors available, D = incomplete (a set bit means **not** complete).
- Spark, bits 0–7: catalyst, heated catalyst, evaporative system, secondary air, gasoline particulate filter, O2 sensor, O2 sensor heater, EGR and/or VVT.
- Compression, bits 0–7: NMHC catalyst, NOx/SCR, *reserved*, boost pressure, *reserved*, exhaust gas sensor, PM filter, EGR and/or VVT.
- PID 41 has the same layout with A = 0. There an "available" bit means "enabled this drive cycle", so the UI says "not enabled" rather than "not supported".

**Several ECUs can answer 0101** (engine and transmission, say). Taking only the first reply could show everything as unsupported, so the replies are combined:
- MIL is on if any ECU requests it;
- counts are summed;
- a monitor is incomplete if any ECU that supports it reports it incomplete, and unsupported only if no ECU supports it.

`[verify]` this rule against a real multi-ECU car.

## DTC descriptions

`describeDtc` (`lib/obd/dtc.ts`) looks codes up in `lib/obd/dtc-p0.json`. Anything not in the table shows **"Manufacturer-specific / unknown"**. Descriptions are never written by hand.

- **Source:** [todrobbins/dtcdb](https://github.com/todrobbins/dtcdb), `generic.csv` at commit `129a8cbfc1d23be63d83948a9ddc99c392489a35` (2013-07-30). MIT License, © 2013 trobbins. The repository names SAE J2012 (2002) as its source, via law.resource.org.
- **Conversion:** P0xxx rows only, description text kept verbatim, sorted by code. A code listed twice with different text is dropped: only P0109, whose second row is really P0110. Result: 466 codes, P0100–P0804.
- **Known gaps:** P0001–P0099, P0109, P0110 and P0805+ show as unknown. Some descriptions carry upstream typos verbatim (e.g. "02 Sensor" with a zero for "O2").
- `[verify]` **Licence (owner review needed):** the repository is MIT, but the text derives from SAE J2012, which SAE holds the copyright to. Confirm that bundling it is acceptable.

## Export

`lib/diagnostics/report.ts` builds one report shape (`toReport`): timestamp, VIN, MIL/count, all three code lists with descriptions, both readiness sets, the freeze frame (rounded to 2 decimals) and any read errors.

- **JSON:** `toReport` pretty-printed.
- **CSV:** one `section,item,value,unit` table, RFC 4180 quoting, CRLF.
- **PDF:** `window.print()`. `components/diagnostics/PrintReport.tsx` portals a black-on-white report into `<body>`, and print CSS hides everything else, including any app shell. No PDF library.

Files download with an `<a download>` Blob link. Nothing leaves the device.

## Scan history

IndexedDB database `obd-dash-scans` (v1), object store `scans`, keyPath `at` (scan time in ms). Every live scan and every after-clear re-read is saved. The history list can open (read-only view), re-export (JSON/CSV) or delete a scan, and works offline without a connection. To print an old scan, open it first.

## Simulator additions

In the marked "Diagnostics (phase 2)" block of `lib/sim/elm327.ts` (demo data, not from a real car):
- `engineRunning` flag (off → RPM, speed, throttle, load, MAF and fuel rate are 0);
- a readiness reset on Mode 04;
- a `0141` reply (EVAP still incomplete this drive cycle);
- freeze frame widened to PIDs 04 05 06 07 0B 0C 0D 0E 0F 10 11.

## Tests

`lib/diagnostics/diagnostics.test.ts`, run through the simulator:
- all three code modes, MIL, readiness, VIN and the freeze frame;
- clear blocked at RPM > 0 (no `04` sent);
- clear at RPM 0, with a re-read showing stored and pending cleared and permanent kept;
- clear blocked when RPM is unreadable;
- the polling hold during the flow;
- readiness bits for spark, compression and multiple ECUs;
- the freeze-frame decode;
- the JSON and CSV export shapes;
- DTC description lookup.

## Screenshots

Demo mode, `docs/screenshots/diagnostics/`:

| | |
| --- | --- |
| Not connected (phone) | `not-connected-phone.png` |
| Not connected + saved history (desktop) | `not-connected-history-desktop.png` |
| Scan with freeze frame, readiness, history (phone) | `scan-freeze-frame-phone.png` |
| Opened saved scan (desktop) | `history-scan-desktop.png` |
| Clear confirmation (phone / desktop) | `clear-confirm-phone.png`, `clear-confirm-desktop.png` |
| Clear blocked, engine running (phone) | `clear-blocked-phone.png` |
| Clear result (phone) | `clear-result-phone.png` |
| After clear + history (phone) | `after-clear-history-phone.png` |
| Print / PDF report (desktop) | `print-report-desktop.png` |
