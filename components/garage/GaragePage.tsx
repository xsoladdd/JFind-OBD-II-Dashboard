"use client";

import { useState } from "react";
import { FolderCard } from "@/components/storage/FolderCard";
import { Badge, Button, cx, EmptyState, InlineNote, NO_VALUE, Panel, Sheet, Stat, StoppedOnly } from "@/components/ui";
import { currentOdometer, remindersByUrgency, todayIso, type CarProfile } from "@/lib/garage/model";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { useGarage } from "@/lib/store/garage";
import { Backup } from "./Backup";
import { ProfileForm } from "./ProfileForm";
import { dueText, REMINDER_LABEL, REMINDER_TONE, Reminders } from "./Reminders";
import { ServiceLog } from "./ServiceLog";

/** The active car at a glance: its odometer and the next due reminder first, details and actions below. */
function ActiveCar({ car, onEdit }: { car: CarProfile; onEdit: () => void }) {
  const services = useGarage((s) => s.services);
  const reminders = useGarage((s) => s.reminders);
  const connected = useConnection((s) => s.status === "connected");
  const readOdo = useGarage((s) => s.readOdometerFromCar);
  const del = useGarage((s) => s.deleteProfile);
  const [note, setNote] = useState("");
  const odo = currentOdometer(car, services);
  const next = remindersByUrgency(car, services, reminders, todayIso())[0];

  async function fromCar() {
    setNote("Reading…");
    try {
      const km = await readOdo();
      setNote(km === null ? "This car doesn't report its odometer (PID 01A6). Enter it by hand." : `Read ${km.toFixed(1)} km from the car.`);
    } catch {
      setNote("Couldn't read the odometer. Enter it by hand.");
    }
  }

  return (
    <section aria-labelledby="active-car" className="space-y-5">
      <div>
        <h2 id="active-car" className="text-2xl font-bold">
          {car.name}
        </h2>
        <p className="text-fg-muted">{[car.make, car.model, car.year].filter(Boolean).join(" ") || "No make/model yet"}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Stat
          size="lg"
          label="Odometer"
          value={odo}
          unit={car.odometerUnit}
          note={car.odometerAt ? `Updated ${car.odometerAt.slice(0, 10)}` : undefined}
        />
        <div className="min-w-0">
          <div className="text-sm text-fg-muted">Next due</div>
          {next ? (
            <>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold">
                {next.r.title}
                <Badge tone={REMINDER_TONE[next.status]} className="px-3 py-1 text-base">
                  {REMINDER_LABEL[next.status]}
                </Badge>
              </p>
              <p className="mt-1 text-fg-muted">{dueText(next.r, car, odo)}</p>
            </>
          ) : (
            <p className="mt-1 text-2xl font-bold text-fg-muted">Nothing set</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Fuel</dt>
        <dd>
          {car.fuelType}
          {car.fuelPrice !== null && `, ${car.fuelPrice} ${car.currency || "(no currency)"}/L`}
        </dd>
        {car.weightKg != null && (
          <>
            <dt className="text-fg-muted">Curb weight</dt>
            <dd>{car.weightKg} kg</dd>
          </>
        )}
        <dt className="text-fg-muted">VIN</dt>
        <dd className="break-all font-mono text-sm">{car.vin ?? NO_VALUE}</dd>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onEdit}>Edit car</Button>
        {connected && <Button onClick={() => void fromCar()}>Read odometer from car</Button>}
        <Button variant="danger" onClick={() => confirm(`Delete ${car.name} with its service log and reminders?`) && void del(car.id)}>
          Delete car
        </Button>
      </div>
      {note && (
        <p className="text-fg-muted" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

/** One tap to switch car once the sheet is open (two deliberate steps, DESIGN.md "Driving"). */
function CarsSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: () => void }) {
  const { profiles, activeId, setActive } = useGarage();
  return (
    <Sheet open={open} onClose={onClose} title="Cars">
      <div className="space-y-4 px-2 pb-2 sm:px-3">
        <ul className="grid gap-3">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={p.id === activeId}
                onClick={() => {
                  setActive(p.id);
                  onClose();
                }}
                className={cx(
                  "flex min-h-18 w-full items-center justify-between gap-3 rounded-control border px-4 text-left text-xl font-semibold transition-colors duration-150",
                  p.id === activeId ? "border-accent bg-surface-2" : "border-line-strong hover:bg-surface-2",
                )}
              >
                <span className="min-w-0 truncate">{p.name}</span>
                {p.id === activeId && <Badge tone="accent">Active</Badge>}
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="primary"
          size="drive"
          className="w-full"
          onClick={() => {
            onClose();
            onAdd();
          }}
        >
          Add car
        </Button>
      </div>
    </Sheet>
  );
}

export function GaragePage() {
  const { profiles, activeProfile, detectedVin, loaded, readOnly, error, load, dismissDetectedVin } = useGarage();
  const folderStatus = useFolder((s) => s.status);
  const [form, setForm] = useState<{ initial?: Partial<CarProfile> } | null>(null);
  const [cars, setCars] = useState(false);
  const mode = useConnection((s) => s.mode);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8 short:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight short:text-2xl">Garage</h1>
        {loaded && !form && profiles.length > 0 && (
          <Button aria-haspopup="dialog" aria-expanded={cars} onClick={() => setCars(true)}>
            Cars ({profiles.length})
          </Button>
        )}
      </header>

      {error && (
        <InlineNote role="alert" tone="danger">
          <p>{error}</p>
          {readOnly && (
            <Button size="sm" className="mt-2" onClick={() => void load()}>
              Try again
            </Button>
          )}
        </InlineNote>
      )}

      {detectedVin && !form && (
        <Panel role="status">
          <p>
            Connected car{mode === "demo" ? " (simulator)" : ""} has VIN <span className="break-all font-mono">{detectedVin}</span>, which isn&apos;t in your
            garage yet.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => setForm({ initial: { vin: detectedVin } })}>
              Create profile
            </Button>
            <Button onClick={dismissDetectedVin}>Not now</Button>
          </div>
        </Panel>
      )}

      {folderStatus !== "ready" && (
        <section className="space-y-3">
          <InlineNote tone="warn" title="Choose a folder to save your cars">
            Until then they only live in this tab and are lost when it closes.
          </InlineNote>
          <FolderCard />
        </section>
      )}

      {!loaded ? null : form ? (
        <Panel title={form.initial?.id ? "Edit car" : "New car"}>
          <StoppedOnly label="Car details">
            <ProfileForm key={form.initial?.id ?? "new"} initial={form.initial} onDone={() => setForm(null)} />
          </StoppedOnly>
        </Panel>
      ) : (
        <>
          {activeProfile ? (
            <>
              <div className="grid items-start gap-6 lg:grid-cols-2 short:grid-cols-2">
                <ActiveCar car={activeProfile} onEdit={() => setForm({ initial: activeProfile })} />
                <Reminders car={activeProfile} />
              </div>
              <ServiceLog car={activeProfile} />
            </>
          ) : (
            <EmptyState
              title="No cars yet"
              action={
                <Button variant="primary" onClick={() => setForm({})}>
                  Add car
                </Button>
              }
            >
              Add one, or connect to a car (or use Demo mode) and its VIN will offer to create a profile.
            </EmptyState>
          )}
          <Backup />
        </>
      )}
      <CarsSheet open={cars} onClose={() => setCars(false)} onAdd={() => setForm({})} />
    </main>
  );
}
