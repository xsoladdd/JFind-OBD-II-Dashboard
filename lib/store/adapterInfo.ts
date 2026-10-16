import { create } from "zustand";
import { readAdapterInfo, type AdapterInfo } from "../connect/adapterInfo";
import { withPollingPaused } from "../polling/pause";
import { getClient } from "./connection";

interface AdapterInfoState {
  info: AdapterInfo | null;
  loading: boolean;
  /** Re-reads ATI, AT@1, ATDPN and ATRV from the connected adapter. */
  refresh: () => Promise<void>;
  clear: () => void;
}

export const useAdapterInfo = create<AdapterInfoState>((set, get) => ({
  info: null,
  loading: false,
  async refresh() {
    const client = getClient();
    if (!client?.isOpen || get().loading) return;
    set({ loading: true });
    try {
      const info = await withPollingPaused(() => readAdapterInfo(client));
      if (getClient() === client) set({ info });
    } finally {
      set({ loading: false });
    }
  },
  clear: () => set({ info: null }),
}));
