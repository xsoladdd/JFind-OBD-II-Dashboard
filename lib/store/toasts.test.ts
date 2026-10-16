import { beforeEach, describe, expect, it } from "vitest";
import { useConnection } from "./connection";
import { useToasts, watchConnection } from "./toasts";

const texts = () => useToasts.getState().toasts.map((t) => `${t.kind}: ${t.text}`);

describe("connection toasts", () => {
  beforeEach(() => useToasts.setState({ toasts: [] }));

  it("warns on a drop, then reports the reconnect or the final disconnect", () => {
    const stop = watchConnection();
    useConnection.setState({ status: "connected", mode: "demo" });
    useConnection.setState({ status: "reconnecting" });
    useConnection.setState({ status: "connected" });
    useConnection.setState({ status: "reconnecting" });
    useConnection.setState({ status: "idle" });
    stop();
    expect(texts()).toEqual([
      "warn: Link to the adapter lost. Reconnecting…",
      "info: Reconnected",
      "error: Disconnected: the adapter did not come back",
    ]);
  });

  it("stays quiet on a user disconnect and shows connect errors", () => {
    const stop = watchConnection();
    useConnection.setState({ status: "connected", mode: "demo" });
    useConnection.setState({ status: "idle", mode: null });
    useConnection.setState({ status: "error", error: "No device selected" });
    stop();
    expect(texts()).toEqual(["error: No device selected"]);
  });
});
