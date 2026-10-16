export interface NavItem {
  href: string;
  label: string;
  /** Gets its own tab on phones. Entries without it go into the "More" sheet; the desktop sidebar lists all. */
  primary?: true;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Connect" },
  { href: "/dashboard", label: "Dashboard", primary: true },
  { href: "/diagnostics", label: "Diagnostics", primary: true },
  { href: "/garage", label: "Garage", primary: true },
  { href: "/trips", label: "Trips", primary: true },
  { href: "/ecu", label: "ECU" },
  { href: "/alerts", label: "Alerts" },
  { href: "/history", label: "History" },
];

/** Phone tab bar partition: primary entries keep their order, everything else goes under "More". */
export function splitNav(nav: NavItem[] = NAV) {
  return { primary: nav.filter((n) => n.primary), more: nav.filter((n) => !n.primary) };
}
