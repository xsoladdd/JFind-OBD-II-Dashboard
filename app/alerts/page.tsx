import type { Metadata } from "next";
import { AlertsPage } from "@/components/alerts/AlertsPage";

export const metadata: Metadata = { title: "Alerts · OBD Dash" };

export default function Page() {
  return <AlertsPage />;
}
