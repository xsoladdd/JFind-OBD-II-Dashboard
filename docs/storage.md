# Folder storage: settings.json, scans, debug logs, History

OBD Dash has no database. Settings, scan history, trips, the Garage and debug logs are plain files in a **folder the user picks** (File System Access API, `showDirectoryPicker({ mode: "readwrite" })`). The only thing kept in the browser is the folder *handle*, in IndexedDB (`obd-dash-folder`, store `handle`, key `root`), so the user picks the folder once. No data goes there.

Browsers with no folder picker (iOS/Bluefy, maybe Android Chrome) fall back to the **browser's private file system (OPFS)**, with the same files and the same API. See "Browser fallback" below.

```
<your folder>/
  settings.json                     every setting (below)
  settings-broken-<time>.json       only if settings.json was ever unreadable (the old text, kept)
  scans/<time>_<VIN|NOVIN>.json     one per diagnostic scan (written by Diagnostics)
  logs/<time>_<ble|demo>.log        raw debug-console traffic, one per connection
  garage/garage.json                the whole Garage (cars, service log, reminders), see garage.md
  garage/garage-broken-<time>.json  only if garage.json was unreadable and a backup was imported over it
  trips/<time>_<VIN|NOVIN>.json|csv trip logs (written by Trips)
  dyno/<time>_<VIN|NOVIN>.json      dyno runs (written by the Dyno on /trips), see dyno.md
```

`<time>` is UTC, `YYYY-MM-DDTHH-mm-ssZ` (`fileStamp()` in `lib/storage/folder.ts`).

## Linking the folder

The folder card (on the Connect screen and the History page) shows one of four states:

| Status | What the user sees |
| --- | --- |
| `unsupported` | Neither `showDirectoryPicker` nor OPFS in this browser (feature-detected, no UA sniffing), e.g. Safari private browsing. An amber banner says history and settings can't be saved. Settings still work in memory for the session, and the rest of the app is unaffected. |
| `unlinked` | **Choose folder**. Picking an empty folder (e.g. a new "OBD Dash" folder) is suggested. |
| `needs-permission` | Browsers usually ask again in a new visit. **Allow access to &lt;folder&gt;** calls `requestPermission`, which needs a tap. Tapping **Connect** or **Demo mode** also asks, since that's a tap too. Connect starts the Bluetooth chooser first, so it gets the gesture. |
| `ready` | "Saving to &lt;folder&gt;", with **Change folder** and **Forget folder** (forgetting deletes no files). |
| `ready`, `location: "browser"` | "Saved in this browser" (OPFS fallback, below). No buttons. |

## Browser fallback (OPFS)

Where `showDirectoryPicker` is **missing** but `navigator.storage.getDirectory` (OPFS) **and** `FileSystemFileHandle.createWritable` exist, `initFolder()` uses the OPFS root as the folder:

- Status goes straight to `ready`, with no picker and no permission prompt. `folderName` is `"this browser"` and `useFolder().location` is `"browser"` (`"folder"` for a real folder, `null` while none). `navigator.storage.persist()` is called when it exists (best effort, result ignored) to lower the eviction risk.
- Same file layout, path rules and API: `writeText`, `readText`, `listFiles`, `removeFile` behave identically. `link()` and `unlink()` do nothing.
- Where `showDirectoryPicker` exists nothing changes and OPFS is never offered.
- `createWritable` is required because writes are atomic swaps. Some WebKit versions only have OPFS sync access handles (workers only). Without `createWritable` the status stays `unsupported` rather than reporting `ready` and failing every write.
- **The files aren't visible in the phone's Files app, and clearing the site's data deletes them.** The folder card says so. Use History to **Download** scans and logs (the Garage has its own **Export JSON**).

## Safety

The app writes into a folder that may hold the user's own files, so `checkPath()` allows only `settings.json`, `settings-broken-*.json` and `<dir>/<file>`, where `<dir>` is in the `DIRS` list in `lib/storage/folder.ts` (`scans`, `logs`, `trips`, `garage`, `dyno`). A feature that saves files adds its folder there. Every segment must match `[A-Za-z0-9][A-Za-z0-9._-]*`: no `..`, no absolute paths, no hidden files, one level deep. `removeFile` works only inside those folders. Only the History page (and Trips' own list) calls it, after a confirmation. Writes use `createWritable()`, which swaps the file in on `close()`, and all file operations run one at a time.

## API (`lib/storage/folder.ts`, `lib/storage/settings.ts`)

```ts
useFolder()                 // { status, folderName, location: "folder" | "browser" | null, link(), regrant(), unlink() }
writeText(path, text)       // atomic; creates the subfolder; rejects with FolderUnavailableError unless "ready"
appendText(path, text)
readText(path)              // null if missing
listFiles("scans" | "logs" | "trips" | "garage" | "dyno")
removeFile(path)
fileStamp(date?)            // "2026-10-16T12-30-05Z"

getSetting(key, fallback) / setSetting(key, value) / useSetting(key, fallback) → [value, set]
```

Setting keys: `ble.uuids`, `garage.activeId`, `units`, `dashboard.theme`, `dashboard.redlineRpm`, `dashboard.hudMirror`, `dashboard.customLayouts`, `alerts.rules`. `getSetting` returns the same object until the value changes, so object settings work with `useSyncExternalStore`.

## Settings lifecycle

- Settings live in memory until the folder is `ready`. Then `settings.json` is read and merged, and the **file wins** over memory. The merged result is written back.
- Changes are written 500 ms after the last one (debounced), atomically.
- **Migration:** the old localStorage keys (`obd-dash.uuids`, `obd-dash.garage.active`, `obd-dash.setting.{units,dashboard.theme,dashboard.redlineRpm,dashboard.hudMirror,dashboard.customLayouts,alerts.rules}`) are read at startup, so they keep working before a folder is linked. They're copied into `settings.json` on the first link and removed only after that write succeeds. The app never writes localStorage.
- **Malformed `settings.json`** (not JSON, or not an object): the app doesn't crash. The text is copied to `settings-broken-<time>.json`, defaults are used, a fresh `settings.json` is written, and the folder card shows a warning naming the backup.
- `settings.json` is user-editable, so readers validate what they get. `loadOverrides()` keeps only string UUID fields, and the custom-layout and alert-rule hooks fall back to their defaults when the stored value has the wrong shape.

## Debug logs

`startLogRecorder()` (started by the app shell) follows the connection store, so the ELM queue is never touched:

- Every connect (BLE or Demo) starts `logs/<time>_<ble|demo>.log`.
- One line per console event: `<ISO time> <tx|rx|info|error> <text>`, with CR/LF shown as `␍`/`␊` like the console.
- Lines are written 5 s after they arrive, right away on disconnect or error, and when the buffer passes the cap.
- **Cap: 2 MB per file.** At that size a file still opens in the in-app viewer on a phone. After that a new file starts, named after its first line's time.
- While the folder isn't ready, the newest ~2 MB is kept in memory and written once it is.

## History page (`/history`)

- **Every file has a Download button** (scans and logs). History lists `scans/` and `logs/` only: `garage/garage.json` isn't listed and can't be deleted from here.
- **Scans**: date, VIN and kind (read or clear) from each file's first fields (`format`, `version`, `takenAt`, `vin`, `kind`), newest first. Each links to `/diagnostics?scan=<file name>`, which Diagnostics renders. Files that aren't readable scans are listed so they can be deleted.
- **Debug logs**: size and last write. **View** shows the raw text inline, **Download** saves it.
- **Delete** asks for confirmation.

## Screenshots

`docs/screenshots/storage/`: Demo mode, at 390px and desktop width. `connect-browser-*` and `history-browser-*` show the browser fallback (a Chromium with `showDirectoryPicker` removed by an init script).

## Not covered

- Access revoked mid-session (e.g. via site settings): writes fail (log lines are dropped, settings stay in memory) until the page is reloaded and access is granted again.
- OPFS can still be evicted by the browser under storage pressure, even after `persist()`. [verify] on iOS/Bluefy.
