"use client";

import { useState } from "react";
import { currentOdometer, num, remindersByUrgency, todayIso, type CarProfile, type Reminder, type ReminderStatus } from "@/lib/garage/model";
import { useGarage } from "@/lib/store/garage";
import { Badge, Button, Field, Input, Panel, StoppedOnly, type Tone } from "@/components/ui";

export const REMINDER_TONE: Record<ReminderStatus, Tone> = { overdue: "danger", "due-soon": "warn", ok: "ok" };
export const REMINDER_LABEL: Record<ReminderStatus, string> = { overdue: "Overdue", "due-soon": "Due soon", ok: "OK" };

/** When a reminder is due, in words: "Due 2025-07-01, at 120000 km". */
export function dueText(r: Reminder, car: CarProfile, odo: number | null) {
  const parts = [r.dueDate && `Due ${r.dueDate}`, r.dueOdometer !== null && `at ${r.dueOdometer} ${car.odometerUnit}`].filter(Boolean).join(", ");
  return r.dueOdometer !== null && odo === null ? `${parts} (set the odometer to track this)` : parts;
}

function ReminderForm({ car, initial, onDone }: { car: CarProfile; initial: Reminder; onDone: () => void }) {
  const save = useGarage((s) => s.saveReminder);
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.dueDate ?? "");
  const [odo, setOdo] = useState(initial.dueOdometer === null ? "" : String(initial.dueOdometer));
  const dueOdometer = num(odo);
  const valid = title.trim() !== "" && (date !== "" || dueOdometer !== null);

  return (
    <form
      className="mb-3 grid gap-4 rounded-control border border-line p-3 sm:grid-cols-2 sm:p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await save({ ...initial, title: title.trim(), dueDate: date || null, dueOdometer });
        onDone();
      }}
    >
      <div className="sm:col-span-2">
        <Field label="What is due *">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oil change" />
        </Field>
      </div>
      <Field label="Due date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={`Due at odometer (${car.odometerUnit})`}>
        <Input inputMode="decimal" value={odo} onChange={(e) => setOdo(e.target.value)} />
      </Field>
      <p className="text-sm text-fg-faint sm:col-span-2">Set a date, an odometer, or both. Whichever comes first makes it due.</p>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={!valid}>
          Save reminder
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

export function Reminders({ car }: { car: CarProfile }) {
  const reminders = useGarage((s) => s.reminders);
  const services = useGarage((s) => s.services);
  const del = useGarage((s) => s.deleteReminder);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const odo = currentOdometer(car, services);
  const rows = remindersByUrgency(car, services, reminders, todayIso());

  return (
    <Panel
      title="Reminders"
      action={
        !editing && (
          <Button size="sm" onClick={() => setEditing({ id: crypto.randomUUID(), carId: car.id, title: "", dueDate: null, dueOdometer: null })}>
            Add reminder
          </Button>
        )
      }
    >
      {editing && (
        <StoppedOnly label="Reminder">
          <ReminderForm key={editing.id} car={car} initial={editing} onDone={() => setEditing(null)} />
        </StoppedOnly>
      )}
      {rows.length === 0 && !editing && <p className="text-fg-muted">No reminders. They show here and as a badge on Garage. Nothing leaves this device.</p>}
      <ul className="divide-y divide-line">
        {rows.map(({ r, status }) => (
          <li key={r.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.title}</span>
                <Badge tone={REMINDER_TONE[status]}>{REMINDER_LABEL[status]}</Badge>
              </div>
              <div className="text-sm text-fg-muted">{dueText(r, car, odo)}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-danger-fg" onClick={() => confirm("Delete this reminder?") && void del(r.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
