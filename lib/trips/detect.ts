/** Trip start/stop: starts when the car moves while connected, ends on disconnect or after `stopTimeoutMs` stopped. */
export class TripDetector {
  active = false;
  private lastMoving = 0;
  constructor(public stopTimeoutMs: number) {}

  speed(t: number, kmh: number): "start" | "end" | null {
    if (kmh > 0) {
      this.lastMoving = t;
      if (!this.active) return ((this.active = true), "start");
      return null;
    }
    return this.tick(t);
  }

  /** Also called on a timer, so a trip ends even if readings stop arriving while still connected. */
  tick(t: number): "end" | null {
    if (!this.active || t - this.lastMoving < this.stopTimeoutMs) return null;
    this.active = false;
    return "end";
  }

  disconnect(): "end" | null {
    if (!this.active) return null;
    this.active = false;
    return "end";
  }
}
