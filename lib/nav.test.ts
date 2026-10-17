import { describe, expect, it } from "vitest";
import { NAV, splitNav, type NavItem } from "./nav";

describe("splitNav", () => {
  it("keeps primary entries in NAV order and puts the rest under More", () => {
    const { primary, more } = splitNav();
    expect(primary.map((n) => n.label)).toEqual(["Dashboard", "Diagnostics", "Garage", "Trips"]);
    expect(more.map((n) => n.label)).toEqual(["Connect", "ECU", "Alerts", "History", "PIDs"]);
  });

  it("never drops or duplicates an entry", () => {
    const { primary, more } = splitNav();
    expect([...primary, ...more].sort((a, b) => a.href.localeCompare(b.href))).toEqual([...NAV].sort((a, b) => a.href.localeCompare(b.href)));
  });

  it("sends a newly added entry without `primary` to More", () => {
    const nav: NavItem[] = [...NAV, { href: "/pids", label: "PIDs" }];
    expect(splitNav(nav).more.map((n) => n.href)).toContain("/pids");
    expect(splitNav(nav).primary).toHaveLength(4);
  });
});
