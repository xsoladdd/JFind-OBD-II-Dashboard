# OBD Dash

A client-only web app for the JF327 (an ELM327-style Bluetooth LE OBD-II adapter). It connects over Web Bluetooth, runs the ELM327 init and talks OBD-II to the car. Everything runs in the browser: there is no backend and no cloud API, so nothing leaves the device.

**Status: phase 1.** This phase covers the transport and ELM layer, OBD decoding, a full ELM327 simulator and the connect screen with a raw debug console. The Diagnostics page (phase 2) and the dashboard themes (phase 3) are not built yet.

**Diagnostics** (`/diagnostics`): codes, freeze frame, readiness, safe clear, export, scans saved to your folder. See [docs/diagnostics.md](docs/diagnostics.md).

## Setup

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # Vitest unit tests
npm run lint
npm run build
```

Node 20.9+ is required (developed on Node 24).

No car? Click **Demo mode**. It drives the app with the built-in ELM327 simulator (`lib/sim/`), which answers init AT commands, PID bitmasks, live PIDs with changing values, Modes 02/03/04/07/0A and the 0902 VIN. It splits its replies into small chunks the way a BLE adapter does.

## Deploy to Vercel

1. Import the repository at vercel.com/new. The framework (Next.js) is detected automatically, and no settings or env vars are needed.
2. Deploy. The app is fully static.

Web Bluetooth needs a secure context. Vercel serves HTTPS, and `localhost` also counts as secure.

## Supported browsers

| Browser | Real adapter | Demo mode |
| --- | --- | --- |
| Chrome / Edge (Windows, macOS, Linux, ChromeOS) | ✅ | ✅ |
| Chrome on Android | ✅ | ✅ |
| Bluefy (iOS / iPadOS) | ✅ [verify] | ✅ |
| Safari, Firefox, Chrome on iOS | ❌ (no Web Bluetooth) | ✅ |

When `navigator.bluetooth` is missing, the connect screen shows a banner and disables **Connect**. Demo mode still works.

On Linux, Chrome may need `chrome://flags/#enable-experimental-web-platform-features` [verify].

## Finding the JF327's real UUIDs

The adapter's GATT layout is not documented, so the app probes a list of common ELM327-clone services (`0xFFF0`, `0xFFE0`, `0x18F0`, the ISSC `49535343-…`). It then auto-picks the first characteristic with `notify` and a `write` / `writeWithoutResponse` one, preferring both in the same service.

1. Plug in the adapter, ignition on, open the app in Chrome and tap **Connect**. Pick the adapter.
2. Open **Debug console**. Under *GATT services & characteristics* you'll see every service and characteristic the adapter exposes, with their properties, and which ones were picked (`← notify`, `← write`).
3. If init hangs or the traffic log stays empty, the pick was probably wrong. Open **Settings: Bluetooth UUIDs**, enter the service, notify and write UUIDs from the list (short `fff1` or full 128-bit form), Save, then Disconnect and Connect again.
4. If the adapter's service is not in the candidate list, it won't show up at all, because Web Bluetooth only exposes services listed in `optionalServices`. Enter the service UUID in Settings anyway: it is added to the list on the next Connect. Tools like nRF Connect can show the UUID.
5. Please report what you find so the defaults can be updated (`lib/transport/WebBluetoothTransport.ts`).

The overrides are saved as `ble.uuids` in `settings.json` in the folder you link (see [docs/storage.md](docs/storage.md)).

The raw terminal sends any AT/OBD command and shows the replies exactly as they arrive. `␍` and `␊` mark CR and LF, and each `←` line is one BLE notification.

## Architecture

```
lib/transport/   Transport interface; WebBluetoothTransport, SimulatorTransport; UUID overrides
lib/elm/         ElmClient: serial queue, chunk assembly to ">", cleanup → typed ElmError, init, auto-reconnect
lib/obd/         PID registry + decoders, supported-PID bitmasks, ISO-TP/multi-line parsing, VIN, DTC decode
lib/sim/         ELM327 emulator + fake engine model (used by Demo mode and tests)
lib/store/       Zustand connection store; getClient() shares the one ElmClient with later phases
components/connect/  Connect screen, status, debug console, UUID settings
```

Layers only depend downward (store → elm → transport, obd → elm types), and everything below `components/` is plain TypeScript tested with Vitest.

Garage (car profiles, service log, reminders): see [docs/garage.md](docs/garage.md).
Live dashboard, polling Scheduler and live-data API: see [docs/dashboard.md](docs/dashboard.md).

Advanced diagnostics (`/ecu`: Mode 06, codes per module, Mode 09, battery test): see [docs/ecu.md](docs/ecu.md).
Custom dashboard builder and alerts (`/alerts`): see [docs/custom-dashboard-and-alerts.md](docs/custom-dashboard-and-alerts.md).

Folder storage (`settings.json`, scan history, debug logs, `/history`): see [docs/storage.md](docs/storage.md).

Trips (`/trips`: trip computer, performance timer, trip log and replay, GPS route): see [docs/trips.md](docs/trips.md).

## [verify] list

Things I couldn't confirm without the hardware or an authoritative source:

- [ ] **JF327 GATT UUIDs**: which service and characteristics it really uses (see above).
- [ ] **Write method**: whether the JF327 supports `writeWithoutResponse` (preferred when advertised) or needs `write`.
- [ ] **Line ending**: commands are sent with a `\r` terminator, per the ELM327 datasheet. Confirm the JF327 doesn't need `\r\n`.
- [ ] **MTU / write chunking**: writes are split into 20-byte pieces (default ATT MTU). Confirm the adapter accepts that and check the notification sizes in the log.
- [ ] **Init timing**: some clones need a pause after `ATZ`. The client just waits up to 10 s for the `>` prompt. Check the log for garbage after `ATZ`.
- [ ] **Protocol**: which protocol your car reports via `ATDPN` (shown on the connect screen). The parsers assume header-less replies (`ATH0`) and handle CAN and legacy multi-line formats.
- [ ] **Bluefy on iOS**: assumed to work like Chrome's Web Bluetooth. Untested.
- [ ] **Odometer PID 01A6** (Garage): which cars report it, and that the 0.1 km/bit decode (SAE J1979) matches. Many cars don't; the app falls back to manual entry.
- [ ] **Garage VIN auto-select**: needs Mode 09 PID 02 on the real car; if the JF327/car doesn't answer, the user selects the car by hand.
- [ ] **Garage due-soon windows**: 30 days / 1000 km are app defaults, not manufacturer intervals.
- [ ] **Mode 06 UASID table** (`lib/ecu/mode06.ts`): the scaling and units were cross-checked against a public reproduction of SAE J1979 Appendix E, not the standard itself. Unlisted UASIDs show raw.
- [ ] **Mode 06 MID names**: same source as the UASID table.
- [ ] **Mode 06 on non-CAN protocols**: shown raw and not decoded. Confirm the raw `0600` reply is useful on a J1850/ISO 9141/KWP car.
- [ ] **ATH1 frame format on the JF327**: the parser assumes `<CAN ID><PCI byte><data>` per line, with or without spaces and with or without CAN padding. Check a real `ATH1` + `03` reply in the debug console.
- [ ] **ECU address hints**: "usually Engine" (7E8) and "usually Transmission" (7E9) are a convention, not part of ISO 15765-4. The module's own 090A name is preferred.
- [ ] **Mode 09 IPT counter names** (0908, from a public J1979 reproduction). 090B counters are unnamed.
- [ ] **ECU name (090A) layout**: assumed 20 bytes of ASCII, null-padded.
- [ ] **Battery bands** (general 12 V lead-acid guidance, not manufacturer specs): resting 12.6 / 12.4 / 12.0 V, cranking 9.6 V, charging 13.2 V and 14.8 V.
- [ ] **ATRV accuracy**: the adapter measures at OBD pin 16, not at the battery terminals. Compare it with a multimeter on the JF327.
- [ ] **ATRV sample rate over BLE**: how many readings per second the crank window really gets on the JF327. A shorter dip than that is missed.
- [ ] **Dashboard redline** (phase 3): the default of 6500 rpm is a placeholder. Set your car's redline in the dashboard header.
- [ ] **Dashboard warning zones** (phase 3): coolant hot at ≥ 110 °C and fuel low at ≤ 12 % are general guidance, not from a standard (`lib/dashboard/zones.ts`).
- [ ] **Polling rate on a real JF327** (phase 3): Demo mode reaches about 40 Hz. Check the Hz readout on the dashboard with the real adapter.
- [ ] **Wake Lock / Fullscreen / install on Bluefy (iOS)** (phase 3): untested. The HUD falls back to a full-window overlay without the Fullscreen API.
- [ ] **DTC descriptions licence**: `lib/obd/dtc-p0.json` comes from [todrobbins/dtcdb](https://github.com/todrobbins/dtcdb) (MIT, @129a8cb). Its text derives from SAE J2012, which SAE holds the copyright to. Needs owner review. It covers P0100–P0804 only; everything else shows "Manufacturer-specific / unknown".
- [ ] **Multi-ECU 0101**: MIL, DTC count and readiness are combined across all ECUs that answer (MIL ORed, counts summed, incomplete wins). Check against a car where the engine and transmission ECUs both reply.
- [ ] **Readiness bit C4 (spark)**: labelled "Gasoline particulate filter" per the current J1979 table on Wikipedia. Older J1979 revisions may name it differently.
- [ ] **RPM with the engine off**: clearing needs `010C` to read exactly 0. If an ECU answers NO DATA with the engine off, clearing stays blocked. Confirm on real cars.
- [ ] **Alert examples**: every number in the example rules is a placeholder to adjust per car: coolant above 110 °C (hysteresis 3 °C, 5 s), adapter voltage below 12.0 V (0.3 V, 10 s), RPM above the redline setting (300 rpm, 0 s).
- [ ] **Alert sound and vibration on phones**: check that the beep plays after the Connect tap on Android Chrome and on iOS (Bluefy), and that it vibrates on Android. iOS has no Vibration API.
- [ ] **Folder picker on Android Chrome**: whether `showDirectoryPicker` exists there. The app feature-detects it, and without it it shows the "can't be saved" banner.
- [ ] **Folder re-permission on the Connect tap**: Connect starts the Bluetooth chooser first, then asks for folder access with the same tap. Check on a real device that the two prompts don't interfere. If the folder prompt fails, the **Allow access** button still works.
- [ ] **Bluefy (iOS)**: assumed to have no folder picker, so settings last only for the session there. Older `localStorage` overrides are still read.
- [ ] **Trip fuel estimate constants** (`lib/trips/fuel.ts`): petrol stoichiometric AFR 14.7:1 and density 745 g/L are approximations. Diesel without 015E shows "not available".
- [ ] **Performance timer accuracy**: limited by how often the JF327 updates 010D (Demo mode gets about 6 speed readings/s alongside the other fast PIDs). OBD speed is whole km/h, and the start is the last 0 km/h reading.
- [ ] **GPS accuracy and battery use** during trips on a real phone. Only tested with emulated positions.

## Phase 2 / 3 (not built yet)

Diagnostics (MIL + DTC count from 0101, Mode 03/07/0A, freeze frame, Mode 04 clear behind a confirmation, VIN, readiness, export, scan history), a priority polling scheduler, dashboard themes, PWA, Wake Lock, metric/imperial toggle. `lib/obd/requests.ts` already has `readDtcs`, `clearDtcs` and `readVin`, which the simulator tests exercise.
