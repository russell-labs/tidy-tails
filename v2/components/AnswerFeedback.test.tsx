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

  it("thumbs-up never shows the note box", () => {
    const html = renderToStaticMarkup(
      <AnswerFeedback rated="up" awaitingNote onRate={noop} onSubmitNote={noop} onSkipNote={noop} />,
    );
    expect(html).not.toContain("What went wrong?");
    expect(html).toContain("Thanks for the feedback.");
  });

  it("reveals an optional note box on a thumbs-down awaiting a note", () => {
    const html = renderToStaticMarkup(
      <AnswerFeedback
        rated="down"
        awaitingNote
        onRate={noop}
        onSubmitNote={noop}
        onSkipNote={noop}
      />,
    );
    expect(html).toContain("What went wrong? (optional)");
    expect(html).toContain("Send");
    expect(html).toContain("Skip");
    // The note box is the whole control here — no rating buttons, no thank-you yet.
    expect(html).not.toContain('aria-label="Helpful"');
    expect(html).not.toContain("Thanks for the feedback.");
  });

  it("collapses a thumbs-down to the thank-you once the note step is resolved", () => {
    const html = renderToStaticMarkup(
      <AnswerFeedback
        rated="down"
        awaitingNote={false}
        onRate={noop}
        onSubmitNote={noop}
        onSkipNote={noop}
      />,
    );
    expect(html).toContain("Thanks for the feedback.");
    expect(html).not.toContain("What went wrong?");
  });
});
