"use client";

// Agentic layer — the inbox "draft a reply with the assistant" trigger.
//
// Sam taps this next to one inbound customer text and tells the assistant what
// she wants the reply to say. The draft goes through draftAgentReply (the single
// customer-text injection surface — it loads exactly the one inbound message she
// tapped, scoped to her, and frames it as untrusted DATA), and the result is
// surfaced as the SAME confirm card the chat surface uses. Nothing is sent until
// she taps Confirm: confirmAgentProposal performs the gated send on her tap, and
// Cancel sends nothing. The model can only ever PROPOSE — confirm-before-send is
// the backstop, asserted in pure transitions in lib/inboxReplyFlow.
//
// Visibility is gated by the caller (agentEnabled, from TIDYTAILS_ENABLE_AGENT),
// so the whole affordance is dark until Russell turns the assistant on; the
// actual send stays gated by the existing SMS send flag inside sendInboxSmsReply.

import { useState, useTransition } from "react";
import { confirmAgentProposal } from "@/lib/actions/agentConfirm";
import { draftAgentReply } from "@/lib/actions/agentReply";
import { AssistantConfirmCard, type ConfirmCardStatus } from "@/components/AssistantConfirmCard";
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
} from "@/lib/inboxReplyFlow";

const DRAFT_FAILED = "Something went wrong drafting that reply. Please try again.";
const SEND_FAILED = "That reply couldn't be sent. Nothing was sent.";

export function InboxAssistantReply({
  smsId,
  initialState = initialReplyState,
}: {
  smsId: string;
  /** Test-only seam: render the flow mid-state. Defaults to idle in the app. */
  initialState?: InboxReplyState;
}) {
  const [state, setState] = useState<InboxReplyState>(initialState);
  const [instruction, setInstruction] = useState("");
  const [pending, startTransition] = useTransition();

  function onDraft() {
    const note = instruction.trim();
    if (!note || pending) return;
    setState((s) => beginDraft(s));
    startTransition(async () => {
      try {
        const result = await draftAgentReply(smsId, note);
        setState((s) => draftResolved(s, result));
      } catch {
        setState((s) => draftResolved(s, { status: "error", message: DRAFT_FAILED }));
      }
    });
  }

  // Confirm tap → the ONLY send path. Calls the gated confirm action (which runs
  // the existing sendInboxSmsReply, re-resolving the recipient server-side).
  function onConfirm(proposal: ReplyProposal) {
    if (pending) return;
    setState((s) => beginConfirm(s));
    startTransition(async () => {
      try {
        const result = await confirmAgentProposal(proposal);
        setState((s) => confirmSettled(s, result));
      } catch {
        setState((s) => confirmSettled(s, { status: "error", message: SEND_FAILED }));
      }
    });
  }

  const cardStatus = cardStatusForPhase(state);

  return (
    <div className="mt-3 rounded-xl border border-dashed border-line bg-canvas p-3">
      {state.phase === "idle" ? (
        <button
          type="button"
          onClick={() => setState(openComposer)}
          className="text-sm font-bold text-brand active:text-brand-ink"
        >
          ✨ Draft a reply with the assistant
        </button>
      ) : null}

      {state.phase === "composing" ? (
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wide text-ink-faint">
            What should the reply say?
          </label>
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.currentTarget.value)}
            rows={2}
            maxLength={480}
            placeholder="e.g. tell them 2pm Saturday works"
            className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setState(dismiss)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDraft}
              disabled={!instruction.trim()}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              Draft reply
            </button>
          </div>
        </div>
      ) : null}

      {state.phase === "drafting" ? (
        <p className="text-sm text-ink-soft">Drafting a reply…</p>
      ) : null}

      {cardStatus && (state.phase === "proposed" || state.phase === "confirming" || state.phase === "settled") ? (
        <div className="space-y-2">
          <AssistantConfirmCard
            proposal={state.proposal}
            status={cardStatus as ConfirmCardStatus}
            message={state.phase === "settled" ? state.message : undefined}
            onConfirm={() => onConfirm(state.proposal)}
            onCancel={() => setState(cancelProposal)}
          />
          {state.phase === "settled" ? (
            <button
              type="button"
              onClick={() => {
                setState(dismiss);
                setInstruction("");
              }}
              className="text-xs font-bold text-ink-muted active:text-ink"
            >
              Done
            </button>
          ) : null}
        </div>
      ) : null}

      {state.phase === "failed" ? (
        <div className="space-y-2">
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => setState(openComposer)}
            className="text-xs font-bold text-brand active:text-brand-ink"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
