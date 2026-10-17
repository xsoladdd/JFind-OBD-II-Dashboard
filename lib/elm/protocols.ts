/** ELM327 protocol numbers as reported by ATDPN (datasheet table). */
export const PROTOCOLS: Record<string, string> = {
  "0": "Automatic",
  "1": "SAE J1850 PWM (41.6 kbaud)",
  "2": "SAE J1850 VPW (10.4 kbaud)",
  "3": "ISO 9141-2 (5 baud init)",
  "4": "ISO 14230-4 KWP (5 baud init)",
  "5": "ISO 14230-4 KWP (fast init)",
  "6": "ISO 15765-4 CAN (11 bit ID, 500 kbaud)",
  "7": "ISO 15765-4 CAN (29 bit ID, 500 kbaud)",
  "8": "ISO 15765-4 CAN (11 bit ID, 250 kbaud)",
  "9": "ISO 15765-4 CAN (29 bit ID, 250 kbaud)",
  A: "SAE J1939 CAN (29 bit ID, 250 kbaud)",
  B: "User1 CAN",
  C: "User2 CAN",
};

/** "A6" → { auto: true, number: "6", name: "ISO 15765-4 CAN …" } */
export function describeProtocol(dpn: string) {
  const t = dpn.trim().toUpperCase();
  const auto = t.length === 2 && t.startsWith("A");
  const number = auto ? t.slice(1) : t;
  return { auto, number, name: PROTOCOLS[number] ?? `Unknown (${t})` };
}
