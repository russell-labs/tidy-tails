import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerFeedback } from "./AnswerFeedback";

const noop = () => {};

describe("AnswerFeedback", () => {
  it("offers a thumbs up and thumbs down before a rating is given", () => {
    const html = renderToStaticMarkup(<AnswerFeedback rated={null} onRate={noop} />);
    expect(html).toContain('aria-label="Helpful"');
    expect(html).toContain('aria-label="Not helpful"');
    expect(html).not.toContain("Thanks");
  });

  it("collapses to a thank-you once rated, exposing no more rating buttons", () => {
    const html = renderToStaticMarkup(<AnswerFeedback rated="up" onRate={noop} />);
    expect(html).toContain("Thanks for the feedback.");
    expect(html).not.toContain('aria-label="Helpful"');
    expect(html).not.toContain('aria-label="Not helpful"');
  });
});
