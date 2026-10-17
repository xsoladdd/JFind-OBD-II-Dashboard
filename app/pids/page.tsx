import type { Metadata } from "next";
import { PidsPage } from "@/components/pids/PidsPage";

export const metadata: Metadata = { title: "PIDs · OBD Dash" };

export default function Page() {
  return <PidsPage />;
}
