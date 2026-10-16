import { Emitter, type Transport } from "./types";
import { canonicalUuid, type UuidOverrides } from "./uuidSettings";

/** Services commonly used by ELM327 BLE clones. The JF327's real one is [verify]. */
export const CANDIDATE_SERVICES: BluetoothServiceUUID[] = [
  0xfff0,
  0xffe0,
  0x18f0,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

// 23-byte default ATT MTU minus 3 bytes of header. [verify] whether the JF327 negotiates more.
const WRITE_CHUNK = 20;

export interface GattCharInfo {
  uuid: string;
  properties: string[];
}
export interface GattServiceInfo {
  uuid: string;
  characteristics: GattCharInfo[];
}

export function hasWebBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

const PROPS = [
  "broadcast",
  "read",
  "writeWithoutResponse",
  "write",
  "notify",
  "indicate",
  "authenticatedSignedWrites",
] as const;

export class WebBluetoothTransport implements Transport {
  /** Everything discovered on the last connect, for the debug panel. */
  gatt: GattServiceInfo[] = [];
  selected: { notify: string; write: string } | null = null;
  /** How writes really go out, once connected: decided by the override and what the characteristic offers. */
  writeMethod: "with-response" | "without-response" | null = null;
  deviceName = "";

  private device: BluetoothDevice | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private data = new Emitter<[string]>();
  private dropped = new Emitter<[]>();
  private decoder = new TextDecoder();

  constructor(private overrides: UuidOverrides) {}

  async connect() {
    if (!hasWebBluetooth()) throw new Error("Web Bluetooth is not available in this browser");
    const extra = this.overrides.service ? [canonicalUuid(this.overrides.service)] : [];
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [...CANDIDATE_SERVICES, ...extra],
    });
    this.deviceName = this.device.name ?? "(unnamed)";
    this.device.addEventListener("gattserverdisconnected", () => this.dropped.emit());
    await this.setup();
  }

  async reconnect() {
    if (!this.device) throw new Error("No device to reconnect to");
    await this.setup();
  }

  private async setup() {
    const server = await this.device!.gatt!.connect();
    const services = await server.getPrimaryServices();
    const all: { service: string; char: BluetoothRemoteGATTCharacteristic }[] = [];
    this.gatt = [];
    for (const s of services) {
      let chars: BluetoothRemoteGATTCharacteristic[] = [];
      try {
        chars = await s.getCharacteristics();
      } catch {
        // some services refuse enumeration; still list the service itself
      }
      this.gatt.push({
        uuid: s.uuid,
        characteristics: chars.map((c) => ({
          uuid: c.uuid,
          properties: PROPS.filter((p) => c.properties[p]),
        })),
      });
      for (const c of chars) all.push({ service: s.uuid, char: c });
    }

    const wantService = this.overrides.service && canonicalUuid(this.overrides.service);
    const pool = wantService ? all.filter((x) => x.service === wantService) : all;
    const byUuid = (u: string) => pool.find((x) => x.char.uuid === canonicalUuid(u));
    const canNotify = (c: BluetoothRemoteGATTCharacteristic) => c.properties.notify || c.properties.indicate;
    const canWrite = (c: BluetoothRemoteGATTCharacteristic) => c.properties.write || c.properties.writeWithoutResponse;

    const notify = this.overrides.notify ? byUuid(this.overrides.notify) : pool.find((x) => canNotify(x.char));
    // Prefer a write characteristic in the same service as the notify one.
    const write = this.overrides.write
      ? byUuid(this.overrides.write)
      : (pool.find((x) => x.service === notify?.service && canWrite(x.char)) ?? pool.find((x) => canWrite(x.char)));
    if (!notify || !write) {
      throw Object.assign(
        new Error(
          "No usable notify/write characteristic found. Open the debug console to see what the adapter exposes, then set the UUIDs in Settings.",
        ),
        { name: "NoCharacteristicError" },
      );
    }

    // Reconnects may hand back the same object; never attach the handler twice.
    this.notifyChar?.removeEventListener("characteristicvaluechanged", this.onValue);
    this.notifyChar = notify.char;
    this.writeChar = write.char;
    this.selected = { notify: notify.char.uuid, write: write.char.uuid };
    this.writeMethod = this.pickWriteMethod(write.char);
    this.notifyChar.addEventListener("characteristicvaluechanged", this.onValue);
    await this.notifyChar.startNotifications();
  }

  private pickWriteMethod(c: BluetoothRemoteGATTCharacteristic) {
    const want = this.overrides.writeMethod;
    if (want === "without-response" && c.properties.writeWithoutResponse) return "without-response";
    if (want === "with-response" && c.properties.write) return "with-response";
    // "auto", or the forced method isn't offered by this characteristic: fall back to what it has.
    return c.properties.writeWithoutResponse ? "without-response" : "with-response";
  }

  private onValue = (e: Event) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (value) this.data.emit(this.decoder.decode(value, { stream: true }));
  };

  async disconnect() {
    this.device?.gatt?.disconnect();
  }

  async write(text: string) {
    const c = this.writeChar;
    if (!c) throw new Error("Not connected");
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i < bytes.length; i += WRITE_CHUNK) {
      const part = bytes.slice(i, i + WRITE_CHUNK);
      if (this.writeMethod === "without-response") await c.writeValueWithoutResponse(part);
      else await c.writeValueWithResponse(part);
    }
  }

  onData(cb: (chunk: string) => void) {
    return this.data.on(cb);
  }

  onDisconnect(cb: () => void) {
    return this.dropped.on(cb);
  }
}
