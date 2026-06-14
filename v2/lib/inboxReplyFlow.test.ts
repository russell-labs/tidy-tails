import { describe, expect, it } from "vitest";
import {
  beginConfirm,
  beginDraft,
  cancelProposal,
  cardStatusForPhase,
  confirmSettled,
  dismiss,
  draftResolved,
  initialReplyState,
  openComposer,
  type InboxReplyState,
  type ReplyProposal,
} from "./inboxReplyFlow";

const PROPOSAL: ReplyProposal = {
  kind: "send_text",
  mode: "reply",
  smsId: "sms-1",
  recipientLabel: "Mary Jones",
  message: "Yes — 2pm Saturday works, see you then!",
};

const proposed: InboxReplyState = { phase: "proposed", proposal: PROPOSAL };

describe("inboxReplyFlow — phases", () => {
  it("starts idle and opens the composer", () => {
    expect(initialReplyState).toEqual({ phase: "idle" });
    expect(openComposer()).toEqual({ phase: "composing" });
  });

  it("a draft that returns a reply proposal moves to 'proposed' (a pending confirm card) — NOT a sent state", () => {
    const drafting = beginDraft({ phase: "composing" });
    expect(drafting).toEqual({ phase: "drafting" });
    const next = draftResolved(drafting, { status: "answered", proposal: PROPOSAL });
    expect(next).toEqual({ phase: "proposed", proposal: PROPOSAL });
  });

  it("a draft error (or no proposal) moves to 'failed', never to a proposal", () => {
    expect(draftResolved({ phase: "drafting" }, { status: "error", message: "nope" })).toEqual({
      phase: "failed",
      message: "nope",
    });
    // answered but with no proposal (model couldn't draft a reply) → failed, never proposed.
    const r = draftResolved({ phase: "drafting" }, { status: "answered" });
    expect(r.phase).toBe("failed");
  });

  it("discards a non-reply proposal at the client boundary (defence in depth)", () => {
    const r = draftResolved(
      { phase: "drafting" },
      // Even though the server seam already discards these, the client only ever
      // accepts a send_text/reply proposal for the confirm card.
      { status: "answered", proposal: { kind: "delete_household", clientId: "c1" } as never },
    );
    expect(r.phase).toBe("failed");
  });
});

describe("inboxReplyFlow — the no-auto-send backstop", () => {
  it("the ONLY transition that can lead to a send is beginConfirm, and it requires a pending proposal", () => {
    // From a proposed card, beginConfirm is the single path toward the send.
    expect(beginConfirm(proposed)).toEqual({ phase: "confirming", proposal: PROPOSAL });

    // beginConfirm is a no-op from every other phase — a send can never start
    // without an actual pending proposal in hand.
    for (const state of [
      initialReplyState,
      { phase: "composing" } as InboxReplyState,
      { phase: "drafting" } as InboxReplyState,
      { phase: "confirming", proposal: PROPOSAL } as InboxReplyState,
      { phase: "failed", message: "x" } as InboxReplyState,
    ]) {
      expect(beginConfirm(state)).toBe(state);
    }
  });

  it("drafting a reply never produces a 'confirming' or saved state on its own (no auto-send)", () => {
    const after = draftResolved({ phase: "drafting" }, { status: "answered", proposal: PROPOSAL });
    expect(after.phase).not.toBe("confirming");
    expect(after.phase).not.toBe("settled");
    expect(after.phase).toBe("proposed");
  });

  it("cancelling a pending proposal settles as cancelled and never starts a send", () => {
    const cancelled = cancelProposal(proposed);
    expect(cancelled).toEqual({ phase: "settled", proposal: PROPOSAL, status: "cancelled" });
  });

  it("confirm settles the card with the server's result (saved/gated/error)", () => {
    const confirming = beginConfirm(proposed);
    expect(confirmSettled(confirming, { status: "saved", message: "Replied to Mary Jones." })).toEqual({
      phase: "settled",
      proposal: PROPOSAL,
      status: "saved",
      message: "Replied to Mary Jones.",
    });
    const gated = confirmSettled(confirming, { status: "gated", message: "off" });
    expect(gated.phase === "settled" && gated.status).toBe("gated");
    const errored = confirmSettled(confirming, { status: "error", message: "boom" });
    expect(errored.phase === "settled" && errored.status).toBe("error");
  });

  it("dismiss returns to idle so the composer can be reopened", () => {
    expect(dismiss()).toEqual({ phase: "idle" });
  });
});

describe("cardStatusForPhase", () => {
  it("renders a confirm card only once there's a proposal (pending → confirming → terminal)", () => {
    expect(cardStatusForPhase(initialReplyState)).toBeNull();
    expect(cardStatusForPhase({ phase: "composing" })).toBeNull();
    expect(cardStatusForPhase({ phase: "drafting" })).toBeNull();
    expect(cardStatusForPhase({ phase: "failed", message: "x" })).toBeNull();
    expect(cardStatusForPhase(proposed)).toBe("pending");
    expect(cardStatusForPhase({ phase: "confirming", proposal: PROPOSAL })).toBe("confirming");
    expect(cardStatusForPhase({ phase: "settled", proposal: PROPOSAL, status: "saved" })).toBe("saved");
    expect(cardStatusForPhase({ phase: "settled", proposal: PROPOSAL, status: "cancelled" })).toBe(
      "cancelled",
    );
  });
});
