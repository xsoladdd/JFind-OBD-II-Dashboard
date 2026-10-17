import { describe, expect, it } from "vitest";
import { isDriving } from "./driving";

describe("isDriving", () => {
  it("is true only when connected and moving", () => {
    expect(isDriving("connected", 12)).toBe(true);
    expect(isDriving("connected", 0)).toBe(false);
    expect(isDriving("connected", undefined)).toBe(false);
  });

  it("is false whenever not connected, whatever the last speed was", () => {
    for (const s of ["idle", "connecting", "reconnecting", "error"] as const) expect(isDriving(s, 80)).toBe(false);
  });
});
