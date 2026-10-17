"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { FUEL_TYPES, num, str, type CarProfile, type FuelType, type OdoUnit } from "@/lib/garage/model";
import { blankProfile, useGarage } from "@/lib/store/garage";

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
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Name *">
          <Input name="name" autoComplete="off" value={p.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Daily Golf" required />
        </Field>
      </div>
      <Field label="Make">
        <Input name="make" autoComplete="off" value={p.make} onChange={(e) => up({ make: e.target.value })} />
      </Field>
      <Field label="Model">
        <Input name="model" autoComplete="off" value={p.model} onChange={(e) => up({ model: e.target.value })} />
      </Field>
      <Field label="Year">
        <Input name="year" autoComplete="off" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
      </Field>
      <Field label="Fuel type">
        <Select name="fuel-type" value={p.fuelType} onChange={(e) => up({ fuelType: e.target.value as FuelType })}>
          {FUEL_TYPES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
      </Field>
      <Field label="Fuel price per litre">
        <Input name="fuel-price-per" autoComplete="off" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field label="Currency (e.g. SEK)">
        <Input name="currency" autoComplete="off" value={p.currency} maxLength={8} onChange={(e) => up({ currency: e.target.value })} />
      </Field>
      <Field label="Odometer">
        <Input name="odometer" autoComplete="off" inputMode="decimal" value={odo} onChange={(e) => setOdo(e.target.value)} />
      </Field>
      <Field label="Unit">
        <Select name="unit" value={p.odometerUnit} onChange={(e) => up({ odometerUnit: e.target.value as OdoUnit })}>
          <option>km</option>
          <option>mi</option>
        </Select>
      </Field>
      <Field label="Curb weight (kg, for the dyno)">
        <Input name="curb-weight" autoComplete="off" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="VIN (read from the car when connected)">
          <Input name="vin" autoComplete="off" className="font-mono" value={p.vin ?? ""} onChange={(e) => up({ vin: e.target.value.toUpperCase() || null })} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={!valid}>
          Save car
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
