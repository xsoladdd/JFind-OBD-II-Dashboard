# UI kit

`components/ui/`: the building blocks for every screen. Design rules (tokens, states, layout) are in
[`DESIGN.md`](../DESIGN.md). Import from the barrel:

```tsx
import { Button, Field, Input, Panel, Stat } from "@/components/ui";
```

Every interactive part is at least 44px tall, shows the global focus ring, and works with the keyboard. Tests:
`components/ui/ui.test.tsx`.

## Button, IconButton, buttonClass, linkClass

```tsx
<Button variant="primary" onClick={connect}>Connect</Button>
<Button>Demo mode</Button>                                  {/* secondary is the default */}
<Button variant="ghost" size="sm">Re-read</Button>
<Button variant="danger" onClick={() => confirm("Delete this car?") && remove()}>Delete car</Button>
<Button type="submit" variant="primary" loading={saving}>Save</Button>
<IconButton label="Dismiss" size="sm" onClick={close}>✕</IconButton>

<Link href="/dashboard" className={buttonClass("primary")}>Open dashboard</Link>
<Link href="/history" className={linkClass}>History</Link>
```

- Variants: `primary` (one per view), `secondary`, `ghost`, `danger`. Sizes: `md` (48px, default), `sm` (44px),
  `drive` (72px, for anything a driver may tap while moving: DESIGN.md §12).
- `type` defaults to `"button"`. Inside a form, pass `type="submit"` to the submit button.
- `loading` disables the button, sets `aria-busy` and adds a trailing "…".
- `IconButton` requires `label`: it becomes `aria-label` and the tooltip.

## Panel, Disclosure, panelClass

```tsx
<Panel title="Adapter info" action={<Button variant="ghost" size="sm">Re-read</Button>}>…</Panel>

<Disclosure id="debug-console" summary="Debug console">…</Disclosure>
<Disclosure variant="inset" summary="The adapter doesn't show up">…</Disclosure>  {/* inside a panel */}
```

- `Panel` renders a `<section>` labelled by its `h2` title. Use it only when the group needs a box.
- `Disclosure` is a native `<details>`; pass `open`, `id` or `key` like on `<details>`. The summary says Show/Hide.
- `panelClass` for a custom container with the panel look (`${panelClass} p-4 sm:p-5`).

## Field, Input, Select, Textarea, inputClass

```tsx
<Field label="Service UUID" hint="Leave blank to auto-pick" error={err}>
  <Input name="service" value={v} onChange={(e) => setV(e.target.value)} placeholder="fff0" />
</Field>

<Field label="Write method">
  <Select name="write-method" value={m} onChange={(e) => setM(e.target.value)}>…</Select>
</Field>
```

- `Field` gives the control inside an id, links the label (`htmlFor`), and links hint and error through
  `aria-describedby`. An `error` also sets `aria-invalid` (danger border).
- Controls are 48px tall with 16px text (no zoom-on-focus on iOS). They work outside a `Field` too, with your own
  `id` or a wrapping `<label>`.
- `inputClass` for a raw element that must look like an input.

## Switch

```tsx
<Switch checked={wake} onChange={setWake} label="Keep the screen on" description="While the dashboard is open" />
```

`role="switch"` button; the whole row is the target.

## Badge, badgeClass

```tsx
<Badge tone="ok">Connected</Badge>
<Badge tone="warn">Estimate</Badge>
<Badge tone="count" aria-label="3 reminders due">3</Badge>
```

Tones: `neutral`, `accent`, `ok`, `warn`, `danger`, `count` (solid danger, for nav counts). Never clickable.

## SegmentedControl

```tsx
<SegmentedControl
  label="Dashboard theme"
  value={theme}
  onChange={setTheme}
  options={[{ value: "classic", label: "Classic" }, { value: "sport", label: "Sport" }]}
/>
```

A radio group: one tab stop, arrow keys and Home/End move and select (`nextIndex`). Scrolls sideways when it
doesn't fit. `size="drive"` wraps into a grid of 72px choices instead (the dashboard Menu's layout and units).

## Sheet

```tsx
const [open, setOpen] = useState(false);
<Button aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>More</Button>
<Sheet open={open} onClose={() => setOpen(false)} title="More">…</Sheet>
```

Native modal `<dialog>`: focus trap, Escape, backdrop tap and focus return to the opener come with it. Bottom sheet on
a portrait phone, centred in landscape and on desktop. Used by the phone menu's More sheet.

## Stat, NO_VALUE

```tsx
<Stat label="Voltage" value={volts} unit="V" size="lg" />
<Stat label="Coolant" value={temp} unit="°C" tone={hot ? "danger" : undefined} note={hot && "High"} />
```

Big tabular number (`num` utility) with unit and label. `null`, `undefined` or `""` shows `NO_VALUE` (`--`); `0` shows
`0`. Sizes `md`, `lg`, `xl`. Tone colours the value only when there is one.

## EmptyState

```tsx
<EmptyState title="No scans yet" action={<Button variant="primary">Scan now</Button>}>
  Scans you run are saved here.
</EmptyState>
```

## InlineNote

```tsx
<InlineNote tone="warn" title="This browser can’t talk to Bluetooth adapters">Use Chrome or Edge…</InlineNote>
<InlineNote tone="danger" role="alert">{error}</InlineNote>
<InlineNote>Demo mode uses the built-in simulator.</InlineNote>
```

Tones `info` (default), `warn`, `danger`. Add `role="alert"` only for something that just went wrong, `role="status"`
for a live hint.

## StoppedOnly, StoppedOnlyView

```tsx
<StoppedOnly label="Car details">
  <ProfileForm … />
</StoppedOnly>
```

For anything that needs typing or careful reading (DESIGN.md §12). While the car moves (`useDriving()` from
`lib/drive/driving.ts`: connected and live speed above 0) it shows a large "Available when stopped" panel with the
`label`; when stopped it renders the children normally. The children stay mounted while hidden (`hidden` + `inert`), so
a half-typed form isn't lost. It keeps the vehicle speed polled while on screen. `StoppedOnlyView({ driving })` is the
pure part, for tests. Optional `className` goes on the lock panel (for margins).

## cx

`cx("a", cond && "b", undefined)` joins class names and skips falsy ones.
