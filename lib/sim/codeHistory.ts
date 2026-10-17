// Code-history simulator block: after a Mode 04 clear, P0133 comes back as a pending code, so a Demo
// read → clear → read series gives the history a code that "came back". Demo behaviour only, not a real car's.
// The re-read inside clearCodes still shows nothing; only reads after that one see the code again.
export const SIM_RETURNING_DTC = "P0133";

export class ReturnAfterClear {
  private reads: number | null = null;

  /** Mode 04 was received. */
  cleared() {
    this.reads = 0;
  }

  /** The pending list for this Mode 07 read. */
  pending(base: string[]): string[] {
    if (this.reads === null) return base;
    const back = this.reads++ >= 1 && !base.includes(SIM_RETURNING_DTC);
    return back ? [...base, SIM_RETURNING_DTC] : base;
  }
}
