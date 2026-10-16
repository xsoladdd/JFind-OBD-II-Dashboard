"use client";

import { useState } from "react";
import { Button, cx, StoppedOnly } from "@/components/ui";
import { usePolling } from "@/lib/polling";
import { useConnection } from "@/lib/store/connection";
import { useTheme } from "@/lib/store/settings";
import { useKnownAdapter, useMounted } from "../connect/hooks";
import { AlertBanner, ReconnectingBanner } from "./DriveBanners";
import { DriveSettings, THEME_OPTIONS } from "./DriveSettings";
import { Classic } from "./themes/Classic";
import { Custom } from "./themes/Custom";
import { Drive } from "./themes/Drive";
import { Engineer } from "./themes/Engineer";
import { Hud } from "./themes/Hud";
import { Minimal } from "./themes/Minimal";
import { Sport } from "./themes/Sport";
import { useFullscreen } from "./useFullscreen";
import { useWakeLock } from "./useWakeLock";

const VIEWS = { drive: Drive, classic: Classic, sport: Sport, hud: Hud, minimal: Minimal };

/** Not connected (or the link was lost): one word, then one huge button. */
function NotConnected({ lost }: { lost: boolean }) {
  const status = useConnection((s) => s.status);
  const error = useConnection((s) => s.error);
  const connect = useConnection((s) => s.connect);
  const known = useKnownAdapter();
  const busy = status === "connecting" || status === "reconnecting";
  return (
    <section aria-live="polite" className="mx-auto flex h-full max-w-md flex-col justify-center gap-6">
      <div>
        <h1 className={cx("text-5xl font-bold tracking-tight", lost && !busy && "text-danger-fg")}>
          {busy ? "Connecting…" : lost ? "Connection lost" : "Not connected"}
        </h1>
        {error && !busy && <p className="mt-3 text-lg text-fg-muted">{error}</p>}
      </div>
      <div className="grid gap-4">
        {/* Each connect starts from this tap: the browser's Bluetooth rules need the user gesture. */}
        <Button size="drive" variant="primary" disabled={busy} onClick={() => void connect("ble", known?.device)}>
          {known ? `Reconnect to ${known.name}` : "Connect"}
        </Button>
        <Button size="drive" disabled={busy} onClick={() => void connect("demo")}>
          Demo mode
        </Button>
      </div>
    </section>
  );
}

/**
 * The drive view: the whole screen is the gauges (the shell steps back via the `drive:` variant on #drive-view).
 * Settings, other pages and parked-only tools sit behind one Menu button.
 */
export function Dashboard() {
  usePolling();
  const wake = useWakeLock();
  const fullscreen = useFullscreen();
  const mounted = useMounted();
  const status = useConnection((s) => s.status);
  const [theme, setTheme] = useTheme();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const known = THEME_OPTIONS.some((t) => t.value === theme) ? theme : "drive";

  // A dropped link that couldn't come back leaves the mode set; Disconnect clears it (lib/store/connection.ts).
  const lost = useConnection((s) => s.status === "idle" && s.mode !== null);

  const live = mounted && (status === "connected" || status === "reconnecting");
  const View = known === "custom" || known === "engineer" ? null : VIEWS[known];
  const view = View ? (
    <View />
  ) : known === "custom" ? (
    <Custom editing={editing} setEditing={setEditing} />
  ) : (
    <StoppedOnly label="The Engineer table">
      <Engineer />
    </StoppedOnly>
  );

  return (
    <main
      id="drive-view"
      className="fixed inset-0 z-30 flex flex-col gap-4 bg-bg pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] short:flex-row"
    >
      <div className="relative min-h-0 min-w-0 flex-1">
        {live && <h1 className="sr-only">Dashboard</h1>}
        <div className={cx("h-full transition-opacity duration-150", status === "reconnecting" && "opacity-30")}>
          {live ? view : <NotConnected lost={lost} />}
        </div>
        <div className="absolute inset-x-0 top-0 z-10 space-y-3">
          {live && status === "reconnecting" && <ReconnectingBanner />}
          {live && <AlertBanner />}
        </div>
      </div>
      <div className="flex shrink-0 justify-end short:flex-col">
        <Button size="drive" className="min-w-40" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}>
          Menu
        </Button>
      </div>
      <DriveSettings
        open={menu}
        onClose={() => setMenu(false)}
        theme={known}
        setTheme={setTheme}
        editing={editing}
        setEditing={setEditing}
        wake={wake}
        fullscreen={fullscreen}
      />
    </main>
  );
}
