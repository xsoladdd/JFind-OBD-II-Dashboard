"use client";

import { useState } from "react";
import { currentOdometer, reminderStatus, todayIso, type CarProfile, type Reminder, type ReminderStatus } from "@/lib/garage/model";
import { useGarage } from "@/lib/store/garage";
import { btn, btnPrimary, card, Field, input, num } from "./ui";

const PILL: Record<ReminderStatus, string> = {
  overdue: "bg-red-600/30 text-red-200",
  "due-soon": "bg-amber-600/30 text-amber-200",
  ok: "bg-emerald-600/30 text-emerald-200",
};
const LABEL: Record<ReminderStatus, string> = { overdue: "Overdue", "due-soon": "Due soon", ok: "OK" };
const RANK: Record<ReminderStatus, number> = { overdue: 0, "due-soon": 1, ok: 2 };

function ReminderForm({ car, initial, onDone }: { car: CarProfile; initial: Reminder; onDone: () => void }) {
  const save = useGarage((s) => s.saveReminder);
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.dueDate ?? "");
  const [odo, setOdo] = useState(initial.dueOdometer === null ? "" : String(initial.dueOdometer));
  const dueOdometer = num(odo);
  const valid = title.trim() !== "" && (date !== "" || dueOdometer !== null);

  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await save({ ...initial, title: title.trim(), dueDate: date || null, dueOdometer });
        onDone();
      }}
    >
      <div className="col-span-2">
        <Field label="What is due *">
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oil change" />
        </Field>
      </div>
      <Field label="Due date">
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={`Due at odometer (${car.odometerUnit})`}>
        <input className={input} inputMode="decimal" value={odo} onChange={(e) => setOdo(e.target.value)} />
      </Field>
      <p className="col-span-2 text-xs text-zinc-500">Set a date, an odometer, or both. Whichever comes first makes it due.</p>
      <div className="col-span-2 flex gap-2">
        <button className={btnPrimary} disabled={!valid}>
          Save reminder
        </button>
        <button type="button" className={btn} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function Reminders({ car }: { car: CarProfile }) {
  const reminders = useGarage((s) => s.reminders);
  const services = useGarage((s) => s.services);
  const del = useGarage((s) => s.deleteReminder);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const today = todayIso();
  const odo = currentOdometer(car, services);
  const rows = reminders
    .filter((r) => r.carId === car.id)
    .map((r) => ({ r, status: reminderStatus(r, today, odo) }))
    .sort((a, b) => RANK[a.status] - RANK[b.status]);

  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Reminders</h2>
        {!editing && (
          <button className={btn} onClick={() => setEditing({ id: crypto.randomUUID(), carId: car.id, title: "", dueDate: null, dueOdometer: null })}>
            Add reminder
          </button>
        )}
      </div>
      {editing && <ReminderForm key={editing.id} car={car} initial={editing} onDone={() => setEditing(null)} />}
      {rows.length === 0 && !editing && <p className="mt-3 text-sm text-zinc-400">No reminders. They show here and as a badge on Garage. Nothing leaves this device.</p>}
      <ul className="mt-3 divide-y divide-zinc-800">
        {rows.map(({ r, status }) => (
          <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[status]}`}>{LABEL[status]}</span>
              </div>
              <div className="text-xs text-zinc-400">
                {r.dueDate && `Due ${r.dueDate}`}
                {r.dueDate && r.dueOdometer !== null && " · "}
                {r.dueOdometer !== null && `at ${r.dueOdometer} ${car.odometerUnit}`}
                {r.dueOdometer !== null && odo === null && " (set the odometer to track this)"}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="text-xs text-sky-300 underline" onClick={() => setEditing(r)}>
                Edit
              </button>
              <button className="text-xs text-red-300 underline" onClick={() => confirm("Delete this reminder?") && void del(r.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
