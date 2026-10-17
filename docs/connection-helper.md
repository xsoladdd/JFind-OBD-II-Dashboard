# Connection helper

Help for the first tests with a real adapter, all on the Connect screen (`/`). Everything stays on the device: the only way data leaves the page is the clipboard, when you tap **Copy diagnostics**.

Code: `lib/connect/` (plain TypeScript, tested with Vitest), UI in `components/connect/`.

## Adapter info card

Shown once connected (Demo mode too). It reads, with polling paused (`withPollingPaused`):

| Row | Command | Notes |
| --- | --- | --- |
| ELM version | `ATI` | |
| Description | `AT@1` | Clones often answer `?`, shown as "not supported". A silent adapter shows "no answer". |
| Protocol | `ATDPN` | With the name from `lib/elm/protocols.ts`. |
| Voltage | `ATRV` | |
| GATT service, notify, write | none | What the transport picked on connect. Demo mode shows "Simulator, no Bluetooth". |
| Write method | none | `with response` or `without response`, as actually used. |

**Re-read** repeats the four commands. **Copy diagnostics** puts a plain-text summary on the clipboard: mode, status, device, error, the adapter rows, the GATT list, the active UUID overrides and the last 50 debug lines (`formatDiagnostics` in `lib/connect/diagnostics.ts`). Debug lines can include a VIN if you read it. Without clipboard access the same text is shown in a box to copy by hand.

## Troubleshooting guide

A collapsed panel under the status card. When something goes wrong it opens by itself on the matching step (`pickStep` in `lib/connect/troubleshoot.ts`); the other steps stay available underneath.

| Step | Picked when |
| --- | --- |
| No Web Bluetooth | `navigator.bluetooth` is missing (not in Demo mode) |
| Chooser cancelled / no device | connect failed with `NotFoundError` before the Bluetooth link was up |
| GATT connect failed | any other failure before the link was up |
| No notify/write characteristic | the transport's `NoCharacteristicError` |
| `ATZ` timeout or garbage | an init failure after the link was up (e.g. `TIMEOUT`), a `0100` timeout, or an `ATZ` answer with no ELM-style version line |
| `UNABLE TO CONNECT` / `NO DATA` / `BUS INIT` | the adapter answered but `0100` got `UNABLE_TO_CONNECT`, `NO_DATA`, `BUS_INIT` or `CAN_ERROR` |
| Repeated disconnects | the link dropped during init, or twice since the last fresh connect |

The advice is general ELM327 and Web Bluetooth guidance, not claims about the JF327. Steps link to the UUID settings and the debug console.

`useConnection` keeps the last failure as `failure` (`name`, `code`, `command`, `afterTransport`) so the guide never parses message text.

## Adapter profiles

A profile is `{ name, service, notify, write, writeMethod }`, stored as `ble.profiles` in `settings.json` (hook `useAdapterProfiles`). Blank UUIDs mean auto-pick. `writeMethod` is `auto` (without response when the characteristic offers it, as before), `with-response` or `without-response`. A forced method the characteristic doesn't offer falls back to what it has.

- **Profile in use**: picking one copies its fields to `ble.uuids` (`saveOverrides`), which is what the transport reads through `loadOverrides`, so nothing changed for the transport apart from the new `writeMethod` field. Old `ble.uuids` values without it load as `auto`.
- **Edit profile**: the UUID form. *Save* applies the values; *Save profile* also stores them under a name. *Copy the working settings into the form* (while connected over Bluetooth) fills in the UUIDs and write method that are working right now, including the service the notify characteristic belongs to.
- **Export / Import**: JSON `{ "profiles": [...] }`. Import accepts that or a bare list, keeps valid entries, replaces profiles with the same name and lists every entry it skipped and why (`parseProfiles` in `lib/connect/profiles.ts`).

## Tests

`lib/nav.test.ts`, `lib/connect/profiles.test.ts`, `lib/connect/troubleshoot.test.ts`, `lib/connect/diagnostics.test.ts` (also covers `readAdapterInfo` against the simulator).

## Phone menu

On phones the tab bar shows the entries marked `primary: true` in `lib/nav.ts` plus a **More** tab. More opens a modal sheet listing every other entry, so new `NAV` entries appear there on their own. The desktop sidebar lists everything. The sheet is a native `<dialog>`: focus moves in, Escape or a tap on the backdrop closes it, and focus goes back to the More tab. Badges of entries inside More (`BADGES` in `components/shell/NavLinks.tsx`) show on the More tab. The connection chip in the header links to Connect.
