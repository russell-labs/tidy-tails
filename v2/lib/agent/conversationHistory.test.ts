import { describe, expect, it } from "vitest";
import { buildAgentHistory, type ConversationEntry } from "./conversationHistory";
import { describeProposal, type AgentProposal } from "./proposals";

// TT-027 — multi-turn context bleed. The chat surface used to DROP proposal turns
// from the history it sends the model (and a silent propose turn left no assistant
// text at all). So a prepared action left no trace: a prior user request looked
// UNANSWERED, and on a later turn the model re-emitted the stale proposal instead
// of building the right one. buildAgentHistory is the fix: every prepared action
// becomes a resolved assistant turn, so no request looks unanswered.

const BOOK: AgentProposal = {
  kind: "book_appointment",
  householdName: "Maple Greenwood",
  householdPhone: null,
  ownerName: "Maple Greenwood",
  petQueries: ["Biscuit"],
  petNames: "Biscuit",
  date: "2026-07-11",
  timeSlot: "10:00am",
  serviceType: "full_groom",
  service: "Full groom",
  fee: 50,
  location: "gina",
  locationLabel: "Tidy Tails (Gina)",
  durationMinutes: null,
  scheduleNote: null,
};

const ADD_PET: AgentProposal = {
  kind: "add_pet",
  householdName: "Maple Greenwood",
  householdPhone: null,
  ownerName: "Maple Greenwood",
  name: "RehearsalPup",
  breed: null,
  size: null,
  allergies: null,
  allergiesDetail: null,
  groomingNotes: null,
  typicalFee: null,
};

/** The Anthropic adapter maps 1:1 and rejects two same-role turns in a row. */
function expectStrictlyAlternating(turns: { role: string }[]) {
  for (let i = 1; i < turns.length; i += 1) {
    expect(turns[i].role, `turns ${i - 1} and ${i} are both ${turns[i].role}`).not.toBe(
      turns[i - 1].role,
    );
  }
}

describe("buildAgentHistory — plain turns", () => {
  it("passes user and assistant text turns through in order", () => {
    const turns = buildAgentHistory([
      { kind: "user", text: "what's my day look like" },
      { kind: "assistant", text: "You have one groom at 10:30am." },
      { kind: "user", text: "thanks" },
    ]);
    expect(turns).toEqual([
      { role: "user", text: "what's my day look like" },
      { role: "assistant", text: "You have one groom at 10:30am." },
      { role: "user", text: "thanks" },
    ]);
  });

  it("drops error entries and empty assistant text (no junk turns)", () => {
    const turns = buildAgentHistory([
      { kind: "user", text: "do a thing" },
      { kind: "error", text: "Something went wrong." },
      { kind: "assistant", text: "   " },
      { kind: "user", text: "again" },
    ]);
    // The error + empty assistant produce no turn; the two user turns coalesce.
    expect(turns).toEqual([{ role: "user", text: "do a thing\nagain" }]);
  });
});

describe("buildAgentHistory — a prepared action is visible to the model (TT-027)", () => {
  it("records a CONFIRMED proposal as a resolved assistant turn (done)", () => {
    const turns = buildAgentHistory([{ kind: "proposal", proposal: BOOK, status: "saved" }]);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("assistant");
    expect(turns[0].text).toContain(describeProposal(BOOK));
    expect(turns[0].text.toLowerCase()).toContain("confirmed");
  });

  it("records a CANCELLED proposal as a cancelled assistant turn (nothing done)", () => {
    const turns = buildAgentHistory([{ kind: "proposal", proposal: ADD_PET, status: "cancelled" }]);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("assistant");
    expect(turns[0].text).toContain("RehearsalPup");
    expect(turns[0].text.toLowerCase()).toContain("cancelled");
  });

  it("records a PENDING proposal as awaiting confirm (not dropped — continuity preserved)", () => {
    const turns = buildAgentHistory([{ kind: "proposal", proposal: BOOK, status: "pending" }]);
    expect(turns).toHaveLength(1);
    expect(turns[0].text.toLowerCase()).toContain("awaiting");
  });

  it("records a gated/error proposal as prepared-but-not-saved", () => {
    const gated = buildAgentHistory([{ kind: "proposal", proposal: BOOK, status: "gated" }]);
    expect(gated[0].text.toLowerCase()).toContain("nothing was saved");
    const errored = buildAgentHistory([{ kind: "proposal", proposal: BOOK, status: "error" }]);
    expect(errored[0].text.toLowerCase()).toContain("could not be completed");
  });
});

describe("buildAgentHistory — strict role alternation (Anthropic-safe)", () => {
  it("coalesces a CHATTY propose turn (assistant text + card) into ONE assistant turn", () => {
    const turns = buildAgentHistory([
      { kind: "user", text: "book it" },
      { kind: "assistant", text: "I've prepared that booking." },
      { kind: "proposal", proposal: BOOK, status: "pending" },
    ]);
    expectStrictlyAlternating(turns);
    expect(turns).toHaveLength(2); // user, assistant(coalesced) — not two assistant turns
    expect(turns[1].role).toBe("assistant");
    expect(turns[1].text).toContain("I've prepared that booking.");
    expect(turns[1].text).toContain(describeProposal(BOOK));
  });

  it("coalesces adjacent user turns (an error between them) so the transcript stays alternating", () => {
    const turns = buildAgentHistory([
      { kind: "user", text: "q1" },
      { kind: "error", text: "failed" },
      { kind: "user", text: "q2" },
    ]);
    expect(turns).toEqual([{ role: "user", text: "q1\nq2" }]);
  });
});

describe("buildAgentHistory — GOLDEN: no prior request is left unanswered (the bleed fix)", () => {
  it("book(confirmed) then add_pet(cancelled): both are acknowledged, transcript strictly alternates", () => {
    const entries: ConversationEntry[] = [
      { kind: "user", text: "Book Maple Greenwood's Biscuit at Gina's" },
      { kind: "proposal", proposal: BOOK, status: "saved" },
      { kind: "user", text: "Add a dog named RehearsalPup to Maple Greenwood" },
      { kind: "proposal", proposal: ADD_PET, status: "cancelled" },
    ];
    const turns = buildAgentHistory(entries);

    // Every user request is followed by an assistant turn — nothing looks unanswered.
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expectStrictlyAlternating(turns);
    // The booking was acknowledged as confirmed…
    expect(turns[1].text).toContain(describeProposal(BOOK));
    expect(turns[1].text.toLowerCase()).toContain("confirmed");
    // …and the add-pet as cancelled (so the model won't re-emit the RehearsalPup card).
    expect(turns[3].text).toContain("RehearsalPup");
    expect(turns[3].text.toLowerCase()).toContain("cancelled");
  });

  it("preserves a multi-turn DISAMBIGUATION (clarification + answer survive)", () => {
    const turns = buildAgentHistory([
      { kind: "user", text: "book the Adams dog" },
      { kind: "assistant", text: "Which dog — Coco or Biscuit?" },
      { kind: "user", text: "Coco" },
    ]);
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[1].text).toContain("Which dog");
  });
});
