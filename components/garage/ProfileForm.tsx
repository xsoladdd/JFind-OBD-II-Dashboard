"use client";

import { useState } from "react";
import { FUEL_TYPES, type CarProfile, type FuelType, type OdoUnit } from "@/lib/garage/model";
import { blankProfile, useGarage } from "@/lib/store/garage";
import { btn, btnPrimary, Field, input, num, str } from "./ui";

export function ProfileForm({ initial, onDone }: { initial?: Partial<CarProfile>; onDone: () => void }) {
  const save = useGarage((s) => s.saveProfile);
  const setActive = useGarage((s) => s.setActive);
  const [p, setP] = useState(() => blankProfile(initial));
  const [year, setYear] = useState(str(p.year));
  const [price, setPrice] = useState(str(p.fuelPrice));
  const [odo, setOdo] = useState(str(p.odometer));
  const [weight, setWeight] = useState(str(p.weightKg ?? null));
  const up = (v: Partial<CarProfile>) => setP((x) => ({ ...x, ...v }));
  const y = num(year);
  const valid = p.name.trim() !== "" && (year === "" || (y !== null && Number.isInteger(y) && y >= 1886 && y <= 2200));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const odometer = num(odo);
    await save({
      ...p,
      name: p.name.trim(),
      year: y,
      fuelPrice: num(price),
      currency: p.currency.trim().toUpperCase(),
      odometer,
      weightKg: num(weight),
      odometerAt: odometer !== p.odometer || !p.odometerAt ? (odometer === null ? null : new Date().toISOString()) : p.odometerAt,
    });
    setActive(p.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field label="Name *">
          <input className={input} value={p.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Daily Golf" required />
        </Field>
      </div>
      <Field label="Make">
        <input className={input} value={p.make} onChange={(e) => up({ make: e.target.value })} />
      </Field>
      <Field label="Model">
        <input className={input} value={p.model} onChange={(e) => up({ model: e.target.value })} />
      </Field>
      <Field label="Year">
        <input className={input} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
      </Field>
      <Field label="Fuel type">
        <select className={input} value={p.fuelType} onChange={(e) => up({ fuelType: e.target.value as FuelType })}>
          {FUEL_TYPES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>
      <Field label="Fuel price per litre">
        <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field label="Currency (e.g. SEK)">
        <input className={input} value={p.currency} maxLength={8} onChange={(e) => up({ currency: e.target.value })} />
      </Field>
      <Field label="Odometer">
        <input className={input} inputMode="decimal" value={odo} onChange={(e) => setOdo(e.target.value)} />
      </Field>
      <Field label="Unit">
        <select className={input} value={p.odometerUnit} onChange={(e) => up({ odometerUnit: e.target.value as OdoUnit })}>
          <option>km</option>
          <option>mi</option>
        </select>
      </Field>
      <Field label="Curb weight (kg, for the dyno)">
        <input className={input} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </Field>
      <div className="col-span-2">
        <Field label="VIN (read from the car when connected)">
          <input className={`${input} font-mono`} value={p.vin ?? ""} onChange={(e) => up({ vin: e.target.value.toUpperCase() || null })} />
        </Field>
      </div>
      <div className="col-span-2 flex gap-2">
        <button className={btnPrimary} disabled={!valid}>
          Save car
        </button>
        <button type="button" className={btn} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
