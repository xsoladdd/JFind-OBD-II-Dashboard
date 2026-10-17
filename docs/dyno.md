# Dyno: power and torque estimate

The **Dyno** section on `/trips` (under the performance timer, no nav entry) estimates power and torque at the wheels from one full-throttle pull in a single gear. Like the "dyno" in Play Store OBD apps, **it is an estimate**, not a dynamometer, and the UI says so: an *estimate* badge, the inputs each run used, and an accuracy note.

Code: `lib/trips/dyno.ts` (method, pure), `lib/store/dyno.ts` (state), `components/trips/DynoCard.tsx` and `DynoChart.tsx` (UI), `lib/sim/dyno.ts` (Demo mode).

## Using it

1. Set the car's **curb weight** in Garage (the optional `weightKg` field). Without it, the dyno can't be armed, except in Demo mode, where the simulated car's 1500 kg is used and labelled "demo value".
2. Optionally set the **extra load** (driver, passengers, cargo), a **tyre size** (for wheel torque), and the losses. These are remembered in `settings.json` under `dyno.inputs`.
3. **Arm**. Hold one gear at low RPM, floor it to near the redline, and lift off. Lifting off (or the clutch, or a gear change) ends the pull. It is hands-free and re-arms by itself, like the performance timer. It shares the timer's one-time "only where legal and safe" notice (`trips.perfNoticeSeen`). While armed it holds `requestFast(["010C", "010D"])`, and leaving the page disarms it.
4. The result shows peak power and engine-equivalent torque with their RPM, plus wheel force (or wheel torque with a tyre size). Power and torque are drawn against RPM as two charts, one measure per chart. Tick two runs to compare them on the same charts.

## Method

- **Inputs**: 010C (engine speed, 0.25 rpm per bit) and 010D (vehicle speed, 1 km/h per bit), both SAE J1979. The two are read in turn, so speed is linearly interpolated at each RPM reading's time.
- **Finding the pull** (`DynoRecorder`): the recorder follows RPM from its last low point. When RPM falls `DROP_RPM` below the peak, the climb up to the peak is a candidate. The start is trimmed to the first reading after the last moment RPM rose more slowly than `MIN_RISE_RPM_S` over `RISE_WINDOW_MS`, which cuts off the cruise or idle before flooring it. A candidate needs `MIN_SPAN_RPM` and `MIN_DURATION_S`, or it's silently ignored (normal driving). It is capped at `MAX_PULL_MS`.
- **Gear ratio** (`fitRatio`): least squares through the origin, k = Σ(v·rpm) / Σ(rpm²) km/h per rpm, over readings at or above `MIN_SPEED_KMH`. If any reading is more than 1 km/h + `RATIO_TOL` away from the fit, the pull is **rejected** ("gear change or clutch slip?"), with a toast and a note on the card.
- **Speed from RPM**: v = k·rpm. The 0.25 rpm steps make it much smoother than whole km/h.
- **Smoothing and differentiation** (`smoothDeriv`): a Savitzky–Golay-style least-squares quadratic in real time around each reading, over ±`HALF_WINDOW_S` and at least 5 readings. That handles uneven sample times. The fit gives smoothed v and dv/dt. The first and last half-window are left out of the curve, because there the fit is one-sided and smears the throttle step.
- **Power**: P = m·a·v + Crr·m·g·v + ½·ρ·CdA·v³, with m = curb weight + extra load. Losses can be turned off, which gives only the power used to accelerate the mass.
- **Outputs** at each reading:
  - wheel power P;
  - tractive force F = P / v;
  - **engine-equivalent torque** T = P / ω_engine, with ω = 2π·rpm/60. This is the torque the engine would need to give this wheel power with no losses, and it's the torque that gets plotted;
  - **wheel torque** = F · r, only when a tyre size is given. r is the unloaded radius from the ISO metric size: rim × 25.4 / 2 + width × aspect / 100, in mm. A loaded tyre is a bit smaller.
- **Units**: metric shows kW, N·m and N. Imperial shows hp (mechanical, 745.69987158227022 W), lb·ft (1.3558179483314004 N·m) and lbf (4.4482216152605 N). These are exact definitional factors.

### Constants

| Constant | Value | What it is |
| --- | --- | --- |
| `G` | 9.80665 m/s² | standard gravity (CGPM) |
| `RHO_ISA` | 1.225 kg/m³ | ISA sea-level air density; real density varies with altitude and temperature `[verify]` |
| `EXAMPLE_CRR` | 0.010 | **typical example value** `[verify]`: Wikipedia "Rolling resistance", ordinary car tyres on concrete 0.010–0.015 |
| `EXAMPLE_CDA_M2` | 0.65 m² | **typical example value** `[verify]`: within the passenger-car CdA values on Wikipedia "Automobile drag coefficient" |
| `DROP_RPM` | 200 rpm | app default: ends a pull |
| `MIN_RISE_RPM_S`, `RISE_WINDOW_MS` | 50 rpm/s over 500 ms | app default: slower is "not pulling" `[verify]` |
| `MIN_SPAN_RPM` | 1500 rpm | app default: shortest pull kept |
| `MIN_DURATION_S` | 2 s | app default |
| `MAX_PULL_MS` | 30 s | app default |
| `MIN_SPEED_KMH` | 10 km/h | app default: slower readings are too coarse for the ratio fit |
| `RATIO_TOL` | 5 % (+ 1 km/h) | app heuristic for "the ratio changed" `[verify]` |
| `HALF_WINDOW_S` | 0.6 s | app default smoothing window |

None of the app defaults come from a standard. They were chosen to work in Demo mode and on synthetic data. Tune them on the real JF327.

## Accuracy

The card spells this out for every run:

- **Sample rate**: how many RPM and speed readings per second it got. Fewer readings mean a rougher curve. Demo mode gets about 7 of each per second.
- **Resolution**: RPM is 0.25 rpm and speed is 1 km/h, and the speed comes from RPM through the fitted ratio. The fit error is shown.
- **Ignored**: drivetrain losses, rotating inertia (wheels, driveline, flywheel), slope, wind, and the air density's real value.
- So the result is **roughly power at the wheels, not crank power**. Crank power is higher. Comparing runs made the same way (same gear, road, load) is more meaningful than the absolute number.

## Files

```
dyno/<YYYY-MM-DDTHH-mm-ssZ>_<VIN|NOVIN>.json    one per run
```

The name comes from `tripFileBase()`: the UTC time the pull started, and the active Garage car's VIN with only A–Z and 0–9 kept. `dyno` is in `DIRS` in `lib/storage/folder.ts`.

```json
{
  "format": "obd-dash-dyno", "version": 1,
  "kmhPer1000": 18.51, "worstKmh": 0.6, "rpmHz": 6.8, "speedHz": 6.9, "durationS": 9.6,
  "curve": [{ "rpm": 2330, "w": 45210, "nm": 185.3, "n": 3770 }],
  "peakPower": { "w": 117000, "rpm": 5540 }, "peakTorque": { "nm": 237, "rpm": 3790 },
  "at": 1792165263000, "vin": null,
  "inputs": { "curbKg": 1500, "extraKg": 80, "demoMass": true, "losses": { "crr": 0.01, "cdaM2": 0.65 }, "rhoKgM3": 1.225, "tyre": "205/55 R16", "tyreRadiusM": 0.31595 },
  "raw": { "rpm": [{ "t": 1792165263000, "v": 2047.5 }], "speed": [{ "t": 1792165262950, "v": 37 }] }
}
```

`curve` values are SI (W, N·m, N). `raw` keeps the readings the run was computed from, so it can be re-analysed later. Unreadable or foreign files in `dyno/` are skipped.

The list shows the runs of the **active Garage car** (matched by VIN; runs without a VIN go with a car without one). Without a folder, runs stay in memory until the tab closes, and are written once a folder is ready. **Delete** asks first, then removes the file.

## Demo mode

`lib/sim/dyno.ts`, hooked into the emulator with one line. **Demo pull** (Demo mode, while armed) does the following:

1. holds "3rd gear" at 2000 rpm for 3 s;
2. pulls to 6500 rpm at a fixed 0.0185 km/h per rpm;
3. coasts in gear for 4 s, so RPM falls and the dyno closes the pull;
4. goes back to the normal drive cycle.

Speed is integrated from a demo engine torque curve (260 − 0.000012·(rpm − 3800)² N·m) × 0.85 driveline, minus the example losses on a 1500 kg car. With the demo mass and losses on, the estimate should land close to that curve; the tests check it's within 5 % at the peak. These are demo values, not a real car.

## Tests

`lib/trips/dyno.test.ts` covers:

- **ratio fitting**, including rejecting a gear change and clutch slip;
- **smoothing**: exact on a quadratic with uneven times;
- **a constant-power pull with a known answer**: v = √(v0² + 2Pt/m), sampled with jitter, 0.25 rpm and whole km/h. Every curve point is within 5 %;
- **the loss terms**;
- **the recorder's trimming**, using Demo pulls started during idle, acceleration, cruise and braking, with uneven read timing;
- **the tyre parser**.

The Garage weight's backward compatibility is tested in `lib/garage/garage.test.ts`, and the `dyno/` files in `lib/storage/storage.test.ts`.

## Screenshots

`docs/screenshots/redesign/trips/` (Demo mode): `trips-dyno-phone.png` (a pull's peak figures; the charts are locked while moving),
`trips-dyno-charts-phone.png` (charts, inputs used and accuracy, parked) and `trips-timer-notice-phone.png` (the shared
safety notice). The curb weight field is in the Garage car form (`docs/screenshots/redesign/garage/garage-car-form-phone.png`).

On the page the dyno has one 72px **Arm**; its inputs, charts and run list are behind disclosures and locked while the
car moves (DESIGN.md §12).
