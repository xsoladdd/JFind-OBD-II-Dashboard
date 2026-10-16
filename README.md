# OBD Dash

A client-only web app for the JF327 (an ELM327-style Bluetooth LE OBD-II adapter). It connects over Web Bluetooth, runs the ELM327 init and talks OBD-II to the car. Everything runs in the browser: there is no backend and no cloud API, so nothing leaves the device.

**Status: phase 1.** This phase covers the transport and ELM layer, OBD decoding, a full ELM327 simulator and the connect screen with a raw debug console. The Diagnostics page (phase 2) and the dashboard themes (phase 3) are not built yet.

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

The overrides live in `localStorage` (`obd-dash.uuids`) for that browser only.

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

## [verify] list

Things I couldn't confirm without the hardware or an authoritative source:

- [ ] **JF327 GATT UUIDs**: which service and characteristics it really uses (see above).
- [ ] **Write method**: whether the JF327 supports `writeWithoutResponse` (preferred when advertised) or needs `write`.
- [ ] **Line ending**: commands are sent with a `\r` terminator, per the ELM327 datasheet. Confirm the JF327 doesn't need `\r\n`.
- [ ] **MTU / write chunking**: writes are split into 20-byte pieces (default ATT MTU). Confirm the adapter accepts that and check the notification sizes in the log.
- [ ] **Init timing**: some clones need a pause after `ATZ`. The client just waits up to 10 s for the `>` prompt. Check the log for garbage after `ATZ`.
- [ ] **Protocol**: which protocol your car reports via `ATDPN` (shown on the connect screen). The parsers assume header-less replies (`ATH0`) and handle CAN and legacy multi-line formats.
- [ ] **Bluefy on iOS**: assumed to work like Chrome's Web Bluetooth. Untested.
- [ ] **DTC descriptions** (phase 2): the generic SAE J2012 P0xxx table still needs a data source with a compatible licence. Until then every code shows "Manufacturer-specific / unknown"; descriptions are never guessed.
- [ ] **Odometer PID 01A6** (Garage): which cars report it, and that the 0.1 km/bit decode (SAE J1979) matches. Many cars don't; the app falls back to manual entry.
- [ ] **Garage VIN auto-select**: needs Mode 09 PID 02 on the real car; if the JF327/car doesn't answer, the user selects the car by hand.
- [ ] **Garage due-soon windows**: 30 days / 1000 km are app defaults, not manufacturer intervals.

## Phase 2 / 3 (not built yet)

Diagnostics (MIL + DTC count from 0101, Mode 03/07/0A, freeze frame, Mode 04 clear behind a confirmation, VIN, readiness, export, scan history), a priority polling scheduler, dashboard themes, PWA, Wake Lock, metric/imperial toggle. `lib/obd/requests.ts` already has `readDtcs`, `clearDtcs` and `readVin`, which the simulator tests exercise.
