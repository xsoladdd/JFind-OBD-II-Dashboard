import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClass, Field, Input, NO_VALUE, nextIndex, Stat } from "./index";

describe("SegmentedControl keys", () => {
  it("wraps around with the arrows and jumps with Home/End", () => {
    expect(nextIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextIndex(1, "ArrowDown", 3)).toBe(2);
    expect(nextIndex(1, "Home", 3)).toBe(0);
    expect(nextIndex(0, "End", 3)).toBe(2);
    expect(nextIndex(0, "Enter", 3)).toBeNull();
  });
});

describe("Button", () => {
  it("defaults to type=button and disables itself while loading", () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });

  it("gives every size a 44px+ target", () => {
    expect(buttonClass("primary", "md")).toContain("min-h-12");
    expect(buttonClass("ghost", "sm")).toContain("min-h-11");
  });
});

describe("Stat", () => {
  it("shows the placeholder for a missing value but keeps a real 0", () => {
    expect(renderToStaticMarkup(<Stat label="Speed" value={null} unit="km/h" />)).toContain(`>${NO_VALUE}<`);
    expect(renderToStaticMarkup(<Stat label="Speed" value={0} unit="km/h" />)).toContain(">0<");
  });
});

describe("Field", () => {
  it("links the label, hint and error to the control", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" hint="As on the logbook" error="Required">
        <Input />
      </Field>,
    );
    const id = /<label for="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<input id="${id}" aria-describedby="${id}-hint ${id}-error" aria-invalid="true"`);
  });
});
