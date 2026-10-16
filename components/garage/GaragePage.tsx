"use client";

import Link from "next/link";
import { useState } from "react";
import { currentOdometer, type CarProfile } from "@/lib/garage/model";
import { FolderCard } from "@/components/storage/FolderCard";
import { useFolder } from "@/lib/storage/folder";
import { useGarage } from "@/lib/store/garage";
import { useConnection } from "@/lib/store/connection";
import { Backup } from "./Backup";
import { ProfileForm } from "./ProfileForm";
import { Reminders } from "./Reminders";
import { ServiceLog } from "./ServiceLog";
import { btn, btnPrimary, card } from "./ui";

function CarCard({ car, onEdit }: { car: CarProfile; onEdit: () => void }) {
  const services = useGarage((s) => s.services);
  const connected = useConnection((s) => s.status === "connected");
  const readOdo = useGarage((s) => s.readOdometerFromCar);
  const del = useGarage((s) => s.deleteProfile);
  const [note, setNote] = useState("");
  const odo = currentOdometer(car, services);

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
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{car.name}</h2>
          <p className="text-sm text-zinc-400">{[car.make, car.model, car.year].filter(Boolean).join(" ") || "No make/model yet"}</p>
        </div>
        <div className="flex gap-3">
          <button className="text-sm text-sky-300 underline" onClick={onEdit}>
            Edit
          </button>
          <button
            className="text-sm text-red-300 underline"
            onClick={() => confirm(`Delete ${car.name} with its service log and reminders?`) && void del(car.id)}
          >
            Delete
          </button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-400">Fuel</dt>
        <dd>
          {car.fuelType}
          {car.fuelPrice !== null && ` · ${car.fuelPrice} ${car.currency || "(no currency)"}/L`}
        </dd>
        {car.weightKg != null && (
          <>
            <dt className="text-zinc-400">Curb weight</dt>
            <dd>{car.weightKg} kg</dd>
          </>
        )}
        <dt className="text-zinc-400">VIN</dt>
        <dd className="font-mono text-xs">{car.vin ?? "—"}</dd>
        <dt className="text-zinc-400">Odometer</dt>
        <dd>
          {odo === null ? "—" : `${odo} ${car.odometerUnit}`}
          {car.odometerAt && <span className="text-xs text-zinc-500"> (updated {car.odometerAt.slice(0, 10)})</span>}
        </dd>
      </dl>
      {connected && (
        <div className="mt-3 flex items-center gap-3">
          <button className={btn} onClick={() => void fromCar()}>
            Read odometer from car
          </button>
          {note && <span className="text-xs text-zinc-400">{note}</span>}
        </div>
      )}
    </section>
  );
}

export function GaragePage() {
  const { profiles, activeId, activeProfile, detectedVin, loaded, readOnly, error, load, setActive, dismissDetectedVin } = useGarage();
  const folderStatus = useFolder((s) => s.status);
  const [form, setForm] = useState<{ initial?: Partial<CarProfile> } | null>(null);
  const mode = useConnection((s) => s.mode);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Garage</h1>
          <p className="text-sm text-zinc-400">Your cars, service history and reminders, saved as one file in your storage folder.</p>
        </div>
        <Link href="/" className="text-sm text-sky-300 underline">
          Connect
        </Link>
      </header>

      {folderStatus !== "ready" && (
        <section className="space-y-2">
          <p className="text-sm font-semibold text-amber-300">Choose a folder to save your cars</p>
          <p className="text-sm text-zinc-400">Until then they only live in this tab and are lost when it closes.</p>
          <FolderCard />
        </section>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          <p>{error}</p>
          {readOnly && (
            <button className={`${btn} mt-2`} onClick={() => void load()}>
              Try again
            </button>
          )}
        </div>
      )}

      {detectedVin && !form && (
        <section className="rounded-lg border border-sky-700 bg-sky-950/40 p-4" role="status">
          <p className="text-sm">
            Connected car{mode === "demo" ? " (simulator)" : ""} has VIN <span className="font-mono">{detectedVin}</span>, which isn&apos;t in your garage yet.
          </p>
          <div className="mt-3 flex gap-2">
            <button className={btnPrimary} onClick={() => setForm({ initial: { vin: detectedVin } })}>
              Create profile
            </button>
            <button className={btn} onClick={dismissDetectedVin}>
              Not now
            </button>
          </div>
        </section>
      )}

      {!loaded ? null : form ? (
        <section className={card}>
          <h2 className="mb-3 font-semibold">{form.initial?.id ? "Edit car" : "New car"}</h2>
          <ProfileForm key={form.initial?.id ?? "new"} initial={form.initial} onDone={() => setForm(null)} />
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setActive(p.id)}
                aria-pressed={p.id === activeId}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${p.id === activeId ? "border-sky-500 bg-sky-600/30" : "border-zinc-700 hover:bg-zinc-800"}`}
              >
                {p.name}
              </button>
            ))}
            <button className={btn} onClick={() => setForm({})}>
              + Add car
            </button>
          </div>

          {activeProfile ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <CarCard car={activeProfile} onEdit={() => setForm({ initial: activeProfile })} />
                <Reminders car={activeProfile} />
              </div>
              <ServiceLog car={activeProfile} />
            </div>
          ) : (
            <section className={`${card} text-sm text-zinc-300`}>
              <p>No cars yet. Add one, or connect to a car (or use Demo mode) and its VIN will offer to create a profile.</p>
            </section>
          )}
          <Backup />
        </>
      )}
    </main>
  );
}
