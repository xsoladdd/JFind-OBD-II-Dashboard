import type { Metadata } from "next";
import { GaragePage } from "@/components/garage/GaragePage";

export const metadata: Metadata = { title: "Garage · OBD Dash" };

export default function Page() {
  return <GaragePage />;
}
