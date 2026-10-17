"use client";

import { useState } from "react";
import { num, SERVICE_LABEL, SERVICE_TYPES, str, todayIso, type CarProfile, type ServiceEntry, type ServiceType } from "@/lib/garage/model";
import { useGarage } from "@/lib/store/garage";
import { Button, Disclosure, Field, Input, Select, StoppedOnly, Textarea } from "@/components/ui";

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
      className="mt-3 grid gap-4 rounded-control border border-line p-3 sm:grid-cols-2 sm:p-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        await save({ ...e, odometer: num(odo), cost: num(cost), customType: e.type === "custom" ? e.customType.trim() : "" });
        onDone();
      }}
    >
      <Field label="Date">
        <Input name="date" autoComplete="off" type="date" value={e.date} onChange={(ev) => up({ date: ev.target.value })} required />
      </Field>
      <Field label={`Odometer (${car.odometerUnit})`}>
        <Input name="odometer" autoComplete="off" inputMode="decimal" value={odo} onChange={(ev) => setOdo(ev.target.value)} />
      </Field>
      <Field label="Type">
        <Select name="type" value={e.type} onChange={(ev) => up({ type: ev.target.value as ServiceType })}>
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SERVICE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`Cost${car.currency ? ` (${car.currency})` : ""}`}>
        <Input name="cost" autoComplete="off" inputMode="decimal" value={cost} onChange={(ev) => setCost(ev.target.value)} />
      </Field>
      {e.type === "custom" && (
        <div className="sm:col-span-2">
          <Field label="Custom type *">
            <Input name="custom-type" autoComplete="off" value={e.customType} onChange={(ev) => up({ customType: ev.target.value })} />
          </Field>
        </div>
      )}
      <div className="sm:col-span-2">
        <Field label="Notes">
          <Textarea name="notes" autoComplete="off" rows={2} value={e.notes} onChange={(ev) => up({ notes: ev.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={!valid}>
          Save entry
        </Button>
        <Button onClick={onDone}>Cancel</Button>
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
    <Disclosure summary={`Service log (${rows.length})`}>
      <StoppedOnly label="Service log">
        {!editing && <Button onClick={() => setEditing(blank(car.id))}>Add entry</Button>}
        {editing && <EntryForm key={editing.id} car={car} initial={editing} onDone={() => setEditing(null)} />}
        {rows.length === 0 && !editing && <p className="mt-3 text-fg-muted">No service entries yet.</p>}
        <ul className="mt-3 divide-y divide-line">
          {rows.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-semibold">{s.type === "custom" ? s.customType : SERVICE_LABEL[s.type]}</div>
                <div className="text-sm text-fg-muted">
                  {[s.date, s.odometer !== null && `${s.odometer} ${car.odometerUnit}`, s.cost !== null && `${s.cost}${car.currency ? ` ${car.currency}` : ""}`]
                    .filter(Boolean)
                    .join(", ")}
                </div>
                {s.notes && <div className="mt-1 text-sm text-fg">{s.notes}</div>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-danger-fg" onClick={() => confirm("Delete this service entry?") && void del(s.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </StoppedOnly>
    </Disclosure>
  );
}
