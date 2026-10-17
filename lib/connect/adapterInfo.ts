import { ElmError, type ElmClient } from "../elm/ElmClient";
import { describeProtocol } from "../elm/protocols";

export const NOT_SUPPORTED = "not supported";
export const NO_ANSWER = "no answer";

export interface AdapterInfo {
  /** ATI */
  version: string;
  /** AT@1. Clones often answer "?", shown as "not supported". */
  description: string;
  /** ATDPN plus its name, e.g. "A6 · ISO 15765-4 CAN (11 bit ID, 500 kbaud) (auto)". */
  protocol: string;
  /** ATRV */
  voltage: string;
}

/** One command, never throws: "?" means the adapter doesn't know it, anything else is "no answer". */
async function ask(client: ElmClient, cmd: string): Promise<string> {
  try {
    return (await client.send(cmd))[0]?.trim() || NO_ANSWER;
  } catch (e) {
    return e instanceof ElmError && e.code === "UNKNOWN_COMMAND" ? NOT_SUPPORTED : NO_ANSWER;
  }
}

/** Reads what the adapter says about itself. Callers wrap it in withPollingPaused. */
export async function readAdapterInfo(client: ElmClient): Promise<AdapterInfo> {
  const version = await ask(client, "ATI");
  const description = await ask(client, "AT@1");
  const dpn = await ask(client, "ATDPN");
  const voltage = await ask(client, "ATRV");
  let protocol = dpn;
  if (dpn !== NO_ANSWER && dpn !== NOT_SUPPORTED) {
    const p = describeProtocol(dpn);
    protocol = `${dpn} · ${p.name}${p.auto ? " (auto)" : ""}`;
  }
  return { version, description, protocol, voltage };
}
