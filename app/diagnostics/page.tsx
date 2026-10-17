import type { Metadata } from "next";
import { DiagnosticsScreen } from "@/components/diagnostics/DiagnosticsScreen";

export const metadata: Metadata = { title: "Diagnostics · OBD Dash" };

export default function DiagnosticsPage() {
  return <DiagnosticsScreen />;
}
