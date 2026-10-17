import type { Metadata } from "next";
import { HistoryPage } from "@/components/history/HistoryPage";

export const metadata: Metadata = { title: "History · OBD Dash" };

export default function Page() {
  return <HistoryPage />;
}
