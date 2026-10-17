import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = { title: "Dashboard · OBD Dash" };

export default function DashboardPage() {
  return <Dashboard />;
}
