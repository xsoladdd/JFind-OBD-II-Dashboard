import type { Metadata } from "next";
import { TripsPage } from "@/components/trips/TripsPage";

export const metadata: Metadata = { title: "Trips · OBD Dash" };

export default function Page() {
  return <TripsPage />;
}
