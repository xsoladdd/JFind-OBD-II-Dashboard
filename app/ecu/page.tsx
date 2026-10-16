import type { Metadata } from "next";
import { EcuScreen } from "@/components/ecu/EcuScreen";

export const metadata: Metadata = { title: "ECU · OBD Dash" };

export default function EcuPage() {
  return <EcuScreen />;
}
