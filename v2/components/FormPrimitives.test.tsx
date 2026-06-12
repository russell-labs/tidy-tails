import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field } from "./FormPrimitives";

// M4: error and hint text must be programmatically associated with the
// form control (aria-describedby / aria-invalid), not just visually nearby.

function idOf(html: string, suffix: string): string | null {
  const m = html.match(new RegExp(`id="([^"]*${suffix})"`));
  return m ? m[1] : null;
}

describe("Field aria wiring", () => {
  it("associates the error text with the control via aria-describedby", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" error="Required">
        <input type="text" />
      </Field>,
    );
    const errorId = idOf(html, "-error");
    expect(errorId).toBeTruthy();
    expect(html).toContain(`aria-describedby="${errorId}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Required");
  });

  it("associates the hint text and omits aria-invalid without an error", () => {
    const html = renderToStaticMarkup(
      <Field label="Phone" hint="Cell preferred">
        <input type="tel" />
      </Field>,
    );
    const hintId = idOf(html, "-hint");
    expect(hintId).toBeTruthy();
    expect(html).toContain(`aria-describedby="${hintId}"`);
    expect(html).not.toContain("aria-invalid");
  });

  it("lists hint before error when both are present", () => {
    const html = renderToStaticMarkup(
      <Field label="Email" hint="Optional" error="Invalid email">
        <input type="email" />
      </Field>,
    );
    const hintId = idOf(html, "-hint");
    const errorId = idOf(html, "-error");
    expect(html).toContain(`aria-describedby="${hintId} ${errorId}"`);
  });

  it("merges with an existing aria-describedby on the control", () => {
    const html = renderToStaticMarkup(
      <Field label="Fee" error="Too low">
        <input type="text" aria-describedby="external-note" />
      </Field>,
    );
    const errorId = idOf(html, "-error");
    expect(html).toContain(`aria-describedby="external-note ${errorId}"`);
  });

  it("renders unchanged when there is no hint and no error", () => {
    const html = renderToStaticMarkup(
      <Field label="Name">
        <input type="text" />
      </Field>,
    );
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain('id="');
  });

  it("leaves multi-node children untouched (renders text as before)", () => {
    const html = renderToStaticMarkup(
      <Field label="Pair" error="Pick one">
        <input type="text" name="a" />
        <input type="text" name="b" />
      </Field>,
    );
    // No clone target: the error text still renders with its id, controls untouched.
    expect(html).toContain("Pick one");
    expect(html).not.toContain("aria-describedby");
  });
});
