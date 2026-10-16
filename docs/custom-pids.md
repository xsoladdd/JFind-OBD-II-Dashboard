# More standard PIDs and custom PIDs

## Standard Mode 01 PIDs

`lib/obd/pids.ts` now decodes 57 Mode 01 commands (65 registry entries). The formulas come from SAE J1979 and were cross-checked against the Wikipedia "OBD-II PIDs" reproduction. The new ones:

| PID | Reading | Formula | Tier |
| --- | --- | --- | --- |
| 0103 | Fuel system status (text) | A·256+B, systems 1 and 2 | slow |
| 0108 / 0109 | Short / long term fuel trim bank 2 | A·100/128 − 100 % | medium |
| 0113 / 011D | O2 sensors present, 2 or 4 banks (text) | bit mask | slow |
| 0114–011B | O2 sensor 1–8 voltage, and short-term trim (`0114T` …) | A/200 V; B·100/128 − 100 % | medium |
| 011C | OBD standard (text) | enum | slow |
| 0121 / 0131 | Distance with MIL on / since codes cleared | A·256+B km | slow |
| 012C / 012E | Commanded EGR / evap purge | A·100/255 % | medium |
| 012D | EGR error | A·100/128 − 100 % | medium |
| 0130 | Warm-ups since codes cleared | A | slow |
| 0143 | Absolute load | (A·256+B)·100/255 % | medium |
| 0144 | Commanded equivalence ratio | (A·256+B)·2/65536 | medium |
| 0145, 0147–014C, 015A | Relative / absolute throttle, pedal D/E/F, commanded throttle actuator, relative pedal | A·100/255 % | medium |
| 014D / 014E | Minutes with MIL on / since codes cleared | A·256+B min | slow |
| 0151 | Fuel type (text) | enum | slow |
| 0152 | Ethanol | A·100/255 % | slow |
| 0159 | Fuel rail absolute pressure | (A·256+B)·10 kPa | medium |
| 0161 / 0162 | Driver demand / actual engine torque | A − 125 % | medium |
| 0163 | Engine reference torque | A·256+B Nm | slow |

`min`/`max` are display ranges (an app choice), not the encodable range. The O2 trim entries use ±100 % because B = FF means "sensor not used for trim" and decodes to 99.2 %.

### Registry extension

Two optional fields on `PidDef`, and nothing else changes for existing entries:

- `cmd`: the request to send when it isn't the id. Two-value PIDs are two entries sharing one command (`0114` voltage, `0114T` trim with `cmd: "0114"`). `readCmd(client, cmd)` in `lib/obd/requests.ts` decodes every entry of a command from one reply. The Scheduler requests each command once and records all its entries (`Scheduler.polled` lists requests; `Scheduler.supported` and `useLive().supported` list every entry).
- `text`: enum and bit-status PIDs still decode to a number (the raw code), so the live store, trips and CSV stay numeric. `text(value)` renders it. The Engineer table shows the text across its stat columns. The Custom theme picker, Alerts and trip replay charts leave these PIDs out. Freeze frames and the debug console's decode hint use the text too.

`liveDef(id)` (`lib/store/live.ts`) returns a `LiveDef` with the optional `text`, and also finds custom PIDs.

## Custom PIDs (`/pids`)

The user defines readings the standard doesn't cover, like Torque Pro's extended PIDs. **The app ships no manufacturer PIDs.** One clearly labelled example only works in Demo mode.

A definition (`CustomPid` in `lib/obd/custom.ts`):

| Field | Meaning |
| --- | --- |
| `name`, `unit` | Shown everywhere a reading is. Units in `lib/units.ts` (°C, kPa, km…) convert to imperial like standard PIDs. |
| `request` | Hex sent as is, e.g. `221234` (Mode 22, DID 1234) or `2101`. 1–7 bytes. |
| `header` | Optional `ATSH` value: 3 hex digits on 11-bit CAN (e.g. `7E0`), 6 on 29-bit. Empty = the adapter's default. |
| `prefix` | Optional. The reply must start with it. Default: mode + 0x40, then the PID bytes (`221234` → `621234`). |
| `formula` | Over the data bytes after the prefix (see below). |
| `min`, `max`, `gauge` | Display range and gauge type, as for standard PIDs. |
| `tier` | `fast`, `medium` (3 s) or `slow` (30 s). |
| `enabled` | Only enabled ones are polled. |

Saved in `settings.json` under `pids.custom` via `useCustomPids()` / `getCustomPids()` (`lib/store/settings.ts`). Each stored list is shape-checked once (`sanitizeCustomPids`), so a hand-edited file can't crash the app. **Export JSON** downloads the list; **Import JSON** appends a list (sanitized, clashing ids renamed) so users can share definitions.

Enabled custom PIDs then behave like any other reading: live store, Engineer table, Custom theme, alerts, trips and the CSV recorder. Edits apply to the running Scheduler (`Scheduler.setCustom`) without restarting it.

### Formula language (`lib/obd/formula.ts`)

A tokenizer and recursive-descent parser. **No `eval` or `new Function`.**

- Numbers: `12`, `0.5`, `.5`, `0x1F`.
- Data bytes: `A`–`Z` (A = first byte after the prefix). A formula that uses a byte the reply doesn't have is an error.
- Operators, lowest precedence first (as in C): `|`, `&`, `<<` `>>`, `+` `-`, `*` `/`, unary `-`, then parentheses.
- Helpers: `signed(x)` (8-bit two's complement) and `signed16(x)` (16-bit).
- Anything else is rejected with a message: unknown names (`AB`, `constructor`, `alert`), other characters (`;`, `.`, `` ` ``, `%`, `**`), more than 500 characters or 32 levels of nesting, division by zero, and non-finite results.

Examples: `(A*256+B)/10-40`, `signed(A)*0.75`, `A>>4 & 0x0F`.

### Headers

`withHeader` sends `ATSH<header>`, runs the request, and **always** sends the default back, also after a timeout, a `?` or a bad reply (like `withHeaders` in `lib/ecu/headers.ts` does with ATH0). The default is the ISO 15765-4 functional request ID for the active protocol (from `ATDPN`): `7DF` on 11-bit CAN, `DB33F1` (18DB33F1 with ATCP's default priority) on 29-bit [verify]. A custom PID with a header on a non-CAN protocol fails with "Custom headers need an ISO 15765-4 CAN protocol"; ones without a header work on any protocol.

To keep switches rare, the Scheduler reads a custom PID together with every other due (or fast) custom PID behind the same header: one `ATSH`, the requests, one restore.

A pause (`withPollingPaused`) and a restarted Scheduler (`run()` after `stop()`) wait for the group in flight, restore included, before sending anything (`trackPolling` / `pollingSettled` in `lib/polling/pause.ts`). Before JOID-0015 that was a real bug: the client queue is FIFO, so a DTC scan's `03` or a new Scheduler's `0100` could be queued between `ATSH7E0` and the restore and go out on the custom header.

### Failures

A custom PID that fails 3 times in a row (NO DATA, `?`, a negative `7F` reply, a reply without the prefix, a formula error) is dropped for the session with one warning toast, so a wrong definition can't slow down standard polling. Editing it gives it a new chance. Standard PIDs keep their own rule (dropped after 3 NO DATA).

### Test once

Sends the request with polling paused (`withPollingPaused`) and shows the raw reply lines plus the decoded value or the error. Available in the list and in the form (to test before saving).

## Simulator

- `lib/sim/morePids.ts`: demo values for the new Mode 01 PIDs, derived from the fake engine. The demo car has O2 sensors B1S1, B1S2, B2S1 and B2S2 (0113 = 0x33), and no throttle C or pedal F, so those aren't advertised. The 0160 range mask is now answered (0161–0163).
- `lib/sim/customPids.ts`: the emulator tracks `ATSH` (`ATZ` resets it) and answers two made-up Mode 22 DIDs: `22 1234` (2 bytes, only with header `7E0`; the example uses `(A*256+B)/10-40`) and `22 5678` (1 byte, any header). Unknown DIDs get `7F 22 31`. Headers other than 7DF, 7E0 and DB33F1 get NO DATA for everything, so tests can tell a missing restore.

## Tests

- `lib/obd/obd.test.ts`: a decoder vector for every new entry, the text renderings.
- `lib/sim/simulator.test.ts`: bitmask discovery covers the new commands (0161–0163 included) and values fall inside their ranges.
- `lib/obd/formula.test.ts`: precedence, helpers, errors and malicious input.
- `lib/obd/custom.test.ts`: response prefix matching (multi-frame, negative replies), sanitizing, header set/restore through the simulator, after a timeout and after a rejected ATSH.
- `lib/polling/Scheduler.test.ts`: two-value PIDs from one request, header grouping, dropping a failing custom PID while standard polling continues, live `setCustom`.

## Screenshots

`docs/screenshots/custom-pids/`: `pids-empty-phone.png`, `pids-form-test-phone.png`, `pids-list-phone.png`, `pids-list-desktop.png`, `pids-form-test-desktop.png`, `engineer-new-pids-phone.png`, `engineer-new-pids-desktop.png`.
