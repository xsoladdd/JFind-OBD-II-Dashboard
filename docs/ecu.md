# Advanced diagnostics (`/ecu`)

`/ecu` has four cards: Mode 06 monitor tests, codes per control module, Mode 09 vehicle info, and a battery and charging test. Every read runs inside `withPollingPaused` (`lib/polling/pause.ts`). Only one read runs at a time (`useEcu().busy`), so header mode can never interleave with another query. There is no IndexedDB.

| Code | What |
| --- | --- |
| `lib/ecu/mode06.ts` | MID discovery (0600 → 0620 → …), CAN record parsing, UASID scaling, MID names |
| `lib/ecu/headers.ts` | `withHeaders` (ATH1 … ATH0), ISO-TP reassembly per CAN ID, `readPerEcu` |
| `lib/ecu/mode09.ts` | 0900 bitmask, 0904 CALID, 0906 CVN, 090A ECU name, 0908/090B IPT |
| `lib/ecu/battery.ts` | ATRV sampling and the guidance bands |
| `lib/store/ecu.ts` | `useEcu` store; Demo-mode battery hook |
| `lib/sim/advanced.ts` | Simulator replies for all of the above |
| `components/ecu/*`, `app/ecu/page.tsx` | UI |

## Mode 06

- **CAN (ISO 15765-4, ATDPN 6–9):** `06 <MID>` returns `46` followed by one 9-byte record per test: `MID TID UASID value(2) min(2) max(2)`. A test passes when `min ≤ value ≤ max`. MIDs `00, 20, …, E0` are bitmasks, like Mode 01.
- **Units and scaling:** the UASID picks them. Only the IDs in `UAS` in `mode06.ts` are scaled: 0x01–0x2D, 0x2F, 0x30, and the signed 0x81–0x86, 0x8A–0x8E, 0x90, 0x96. Each one was cross-checked against a public reproduction of SAE J1979 Appendix E. Any other UASID shows the raw 16-bit values with `UASID 0xNN raw [verify]`.
- **MID names:** only the standard ranges get names (O2 sensor, catalyst, EGR, VVT, EVAP, O2 heater, heated catalyst, secondary air, fuel system, misfire). Everything else shows as `MID 0xNN`. TIDs are shown as hex, because most are manufacturer-defined.
- **Older protocols** (J1850, ISO 9141, KWP) use a different Mode 06 layout: TID/CID records with no UASID and mostly manufacturer-defined units. On those cars the card shows the raw `0600` reply and doesn't decode it.

## Codes per control module (header mode)

`withHeaders` sends `ATH1`, runs the queries (`03`, `07`, `0A`, `0902`, `090A`) and sends `ATH0` again on every path. That includes a timeout, an error, and an `ATH1` that fails itself. Live polling parses header-less replies, so this matters.

- With headers on, each frame line starts with its CAN ID: 3 hex characters for 11-bit IDs (protocols 6/8), 8 for 29-bit IDs (7/9). The ISO-TP PCI byte comes next: `0x` single, `1x xx` first frame, `2x` consecutive.
- `splitByEcu` groups frames by ID and rebuilds each message as a header-less hex line, so the existing `parseDtcResponse` and `parseVin` work unchanged. CAN padding after the PCI length is dropped.
- **Labels:** ISO 15765-4 numbers the 11-bit response IDs 7E8–7EF as ECU #1–#8. "Engine" for 7E8 and "Transmission" for 7E9 is only the usual convention, so those hints are marked `[verify]`. When a module answers `090A`, its own name is shown instead. That name is the authoritative one.
- Non-CAN protocols get a clear error and no ATH change.

## Mode 09

- **0900** is the supported-PID bitmask. Only listed PIDs are queried.
- **0904** CALIDs: 16 bytes of ASCII each. **0906** CVNs: 4 bytes each, shown as hex. **090A** ECU name: 20 bytes of ASCII.
- Uses `parseMessages` from `lib/obd/parse.ts`. A CAN reply is one ISO-TP message whose third byte is the item count. A legacy reply is one line per message number, which is the same rule `parseVin` uses.
- **0908** (spark ignition) counters carry the J1979 names (OBDCOND, IGNCNTR, CATCOMP1 …). **090B** (compression ignition) counters show as "Counter N", because I couldn't confirm their order.
- **Limitation:** Mode 09 runs header-less. On a car where several modules answer with multi-frame replies, the frames merge (the existing `parseMessages` shortcut). The per-module card already shows each module's 090A name.

## Battery and charging test

The test runs three steps, all using `ATRV`:

1. Resting: the average of 3 readings, engine off.
2. Cranking: `ATRV` back to back for 5 s while the user cranks. The lowest reading is kept, along with the sample count.
3. Charging: the average of 3 readings at idle.

The bands are **general guidance for 12 V lead-acid systems, not manufacturer specs**. Each threshold is a README `[verify]` item:

| Step | Bands |
| --- | --- |
| Resting | ≥ 12.6 fully charged · 12.4–12.6 partly charged · 12.0–12.4 low · < 12.0 discharged |
| Cranking | ≥ 9.6 held up · < 9.6 weak |
| Charging | < 13.2 low · 13.2–14.8 charging · > 14.8 high |

**Demo mode:** nobody can turn a key in the simulator, so the store sets `emulator.battery` instead:

- Resting reads about 12.5 V.
- The crank step starts a crank 1 s into the window. Voltage dips to about 10.2 V for 0.4 s, then sits around 11.2 V, then rises to about 14.1 V once "running".
- Charging reads about 14.1 V.

## Simulator (`lib/sim/advanced.ts`)

- **Mode 06:** MIDs 01, 21 and A2. MID 21 TID 80 fails, which fits the simulator's P0420. MID 21 TID 81 uses UASID 0x3F to show the raw/`[verify]` path.
- **Mode 09:** 0900 lists 02/04/06/08/0A; 0904, 0906, 0908 and 090A have replies.
- **ATH1:** headers mode is real now. Replies are framed per ECU with PCI bytes and padded to 8 bytes. A transmission ECU at 7E9, with `P0700` and name `TCM-TransmissionCtl`, answers **only in header mode**, so header-less reads still see a single ECU and existing tests keep passing.
- **Hook into `elm327.ts`:**
  - `ATH0`/`ATH1` set `headers` (reset by `ATZ`).
  - `obd()` frames through `headerLines` when headers are on.
  - Mode 06 and the extra Mode 09 PIDs come from `advanced.ts`.
  - `ATRV` uses `batteryVolts` when `battery` is set.
  - `bitmask` is exported.
