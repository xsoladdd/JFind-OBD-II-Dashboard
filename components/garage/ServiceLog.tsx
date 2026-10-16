"use client";

import { useState } from "react";
import { SERVICE_LABEL, SERVICE_TYPES, todayIso, type CarProfile, type ServiceEntry, type ServiceType } from "@/lib/garage/model";
import { useGarage } from "@/lib/store/garage";
import { StoppedOnly } from "@/components/ui";
import { btn, btnPrimary, card, Field, input, num, str } from "./ui";

const blank = (carId: string): ServiceEntry => ({
  id: crypto.randomUUID(),
  carId,
  date: todayIso(),
  odometer: null,
  type: "oil",
  customType: "",
  cost: null,
  notes: "",
});

function EntryForm({ car, initial, onDone }: { car: CarProfile; initial: ServiceEntry; onDone: () => void }) {
  const save = useGarage((s) => s.saveService);
  const [e, setE] = useState(initial);
  const [odo, setOdo] = useState(str(initial.odometer));
  const [cost, setCost] = useState(str(initial.cost));
  const up = (v: Partial<ServiceEntry>) => setE((x) => ({ ...x, ...v }));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(e.date) && (e.type !== "custom" || e.customType.trim() !== "");

  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        await save({ ...e, odometer: num(odo), cost: num(cost), customType: e.type === "custom" ? e.customType.trim() : "" });
        onDone();
      }}
    >
      <Field label="Date">
        <input type="date" className={input} value={e.date} onChange={(ev) => up({ date: ev.target.value })} required />
      </Field>
      <Field label={`Odometer (${car.odometerUnit})`}>
        <input className={input} inputMode="decimal" value={odo} onChange={(ev) => setOdo(ev.target.value)} />
      </Field>
      <Field label="Type">
        <select className={input} value={e.type} onChange={(ev) => up({ type: ev.target.value as ServiceType })}>
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SERVICE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Cost${car.currency ? ` (${car.currency})` : ""}`}>
        <input className={input} inputMode="decimal" value={cost} onChange={(ev) => setCost(ev.target.value)} />
      </Field>
      {e.type === "custom" && (
        <div className="col-span-2">
          <Field label="Custom type *">
            <input className={input} value={e.customType} onChange={(ev) => up({ customType: ev.target.value })} />
          </Field>
        </div>
      )}
      <div className="col-span-2">
        <Field label="Notes">
          <textarea className={input} rows={2} value={e.notes} onChange={(ev) => up({ notes: ev.target.value })} />
        </Field>
      </div>
      <div className="col-span-2 flex gap-2">
        <button className={btnPrimary} disabled={!valid}>
          Save entry
        </button>
        <button type="button" className={btn} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ServiceLog({ car }: { car: CarProfile }) {
  const all = useGarage((s) => s.services);
  const del = useGarage((s) => s.deleteService);
  const [editing, setEditing] = useState<ServiceEntry | null>(null);
  const rows = all.filter((s) => s.carId === car.id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Service log</h2>
        {!editing && (
          <button className={btn} onClick={() => setEditing(blank(car.id))}>
            Add entry
          </button>
        )}
      </div>
      {editing && (
        <StoppedOnly label="Service entry" className="mt-3">
          <EntryForm key={editing.id} car={car} initial={editing} onDone={() => setEditing(null)} />
        </StoppedOnly>
      )}
      {rows.length === 0 && !editing && <p className="mt-3 text-sm text-zinc-400">No service entries yet.</p>}
      <ul className="mt-3 divide-y divide-zinc-800">
        {rows.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-3 py-2 text-sm">
            <div>
              <div className="font-medium">{s.type === "custom" ? s.customType : SERVICE_LABEL[s.type]}</div>
              <div className="text-xs text-zinc-400">
                {s.date}
                {s.odometer !== null && ` · ${s.odometer} ${car.odometerUnit}`}
                {s.cost !== null && ` · ${s.cost}${car.currency ? ` ${car.currency}` : ""}`}
              </div>
              {s.notes && <div className="mt-1 text-xs text-zinc-300">{s.notes}</div>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="text-xs text-sky-300 underline" onClick={() => setEditing(s)}>
                Edit
              </button>
              <button
                className="text-xs text-red-300 underline"
                onClick={() => confirm("Delete this service entry?") && void del(s.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
