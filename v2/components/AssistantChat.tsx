"use client";

// Agentic layer — chat surface (mobile-first), with live status and VOICE.
//
// A phone-shaped conversation: a scrolling transcript over a fixed composer. It
// streams from the read-only `/api/assistant/stream` endpoint (typed) or
// `/api/assistant/voice` endpoint (spoken) so it can show what the assistant is
// doing in real time — Listening, Transcribing, Thinking, the tool in use
// ("Looking up your schedule…"), the answer (Done), Speaking it back, or a
// friendly error. The transcript is held client-side and passed back as light
// context on each turn. Read-only by construction — both endpoints only ever
// return an answer to display.
//
// Voice input uses MediaRecorder (NOT the unreliable iPhone Safari Web Speech
// API): the recorded audio is transcribed server-side, then run through the same
// pipeline. If the mic is unsupported or denied, the surface falls back silently
// to typing. Voice output uses the browser SpeechSynthesis API with a mute
// toggle; it speaks back only voice-initiated answers, so typed turns stay quiet.

import { useEffect, useRef, useState } from "react";
import type { AgentTurn } from "@/lib/agent/runAgent";
import type { AgentProposal } from "@/lib/agent/proposals";
import { buildAgentHistory } from "@/lib/agent/conversationHistory";
import { assistantIntroCopy } from "@/lib/assistantIntroCopy";
import { confirmAgentProposal } from "@/lib/actions/agentConfirm";
import { recordAgentFeedback } from "@/lib/actions/agentFeedback";
import { AnswerFeedback, type FeedbackRating } from "@/components/AnswerFeedback";
import { AssistantStatus, type AssistantStatusPhase } from "@/components/AssistantStatus";
import {
  AssistantConfirmCard,
  type ConfirmCardStatus,
} from "@/components/AssistantConfirmCard";
import {
  MAX_RECORDING_MS,
  detectVoiceInputSupport,
  friendlyMicError,
  pickRecordingMimeType,
  type VoiceInputSupport,
} from "@/lib/agent/voiceInput";
import {
  createSpeaker,
  detectSpeechOutputSupport,
  type Speaker,
  type UtteranceLike,
} from "@/lib/agent/voiceOutput";

type Entry =
  | { kind: "user"; text: string }
  | {
      kind: "assistant";
      text: string;
      toolsUsed: string[];
      rated?: FeedbackRating;
      // TT-039: true between a thumbs-down and the optional note being sent/skipped.
      awaitingNote?: boolean;
    }
  | { kind: "error"; text: string }
  // A prepared write awaiting Sam's confirm tap. The model never executes it;
  // Confirm calls the gated confirm action, Cancel writes nothing.
  | {
      kind: "proposal";
      id: number;
      proposal: AgentProposal;
      status: ConfirmCardStatus;
      message?: string;
    };

/** The in-flight live state shown while a turn streams (or while listening / speaking). */
type LiveStatus = { phase: AssistantStatusPhase; toolName?: string };

type StreamEvent =
  | { type: "transcript"; text: string }
  | { type: "thinking" }
  | { type: "tool"; name: string }
  | { type: "done"; answer: string; toolsUsed?: string[]; proposal?: AgentProposal }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "What does my day look like?",
  "What clipper did I use last time?",
  "How much did I make today?",
];

const GENERIC_ERROR = "Something went wrong answering that. Please try again.";

export function AssistantChat({
  writesEnabled,
  embedded = false,
}: {
  writesEnabled: boolean;
  // Rendered inside another, normally-scrolling page (e.g. the home launcher)
  // rather than the full-screen /assistant route. When true the panel is a
  // self-contained, height-capped card and does NOT pin the app shell to the
  // viewport — so it never hijacks the host page's scroll. Everything else (turn
  // streaming, confirm cards, mic, read-aloud, feedback) is identical. Default
  // false = today's full-screen behaviour, byte-for-byte.
  embedded?: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceSupport, setVoiceSupport] = useState<VoiceInputSupport | null>(null);
  const [speakSupported, setSpeakSupported] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(true);

  const endRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  // Monotonic id for confirm-card entries so a confirm/cancel updates the right one.
  const proposalIdRef = useRef(0);
  // Read the latest mute state inside async stream handlers without re-binding them.
  const speakEnabledRef = useRef(speakEnabled);
  speakEnabledRef.current = speakEnabled;

  // Detect mic + speech-synthesis support once, client-side. Both degrade
  // gracefully: no mic button when recording is unsupported; no mute toggle when
  // speech synthesis is unavailable.
  useEffect(() => {
    setVoiceSupport(
      detectVoiceInputSupport({
        isSecureContext: window.isSecureContext,
        mediaDevices: navigator.mediaDevices,
        MediaRecorder: typeof window.MediaRecorder === "function" ? window.MediaRecorder : undefined,
      }),
    );
    if (detectSpeechOutputSupport(window)) {
      setSpeakSupported(true);
      speakerRef.current = createSpeaker(
        window.speechSynthesis as unknown as Parameters<typeof createSpeaker>[0],
        (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
      );
    }
    return () => {
      stopTracks();
      if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
      speakerRef.current?.cancel();
    };
  }, []);

  // Pin the app shell to the dynamic viewport while the assistant is mounted so
  // this chat panel is a definite-height flex container (transcript scrolls
  // inside, composer + last confirm card always clear the BottomNav). Scoped to
  // this route via a body flag — same idiom as the search/sheet flags — so every
  // other (body-scrolling) page keeps its min-h-dvh growth untouched. Embedded
  // mode lives inside such a body-scrolling page, so it must NOT set the flag:
  // pinning the shell there would hijack the host page's scroll.
  useEffect(() => {
    if (embedded) return;
    document.body.dataset.tidyAssistant = "true";
    return () => {
      delete document.body.dataset.tidyAssistant;
    };
  }, [embedded]);

  function scrollToEnd() {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  /** Apply one streamed event. `speak` is true only for voice turns with TTS on. */
  function applyEvent(event: StreamEvent, speak: boolean) {
    if (event.type === "transcript") {
      // For voice, the user's words arrive from the server transcription; show
      // them as the user's bubble before the answer streams.
      setEntries((current) => [...current, { kind: "user", text: event.text }]);
      setStatus({ phase: "thinking" });
      scrollToEnd();
    } else if (event.type === "thinking") {
      setStatus({ phase: "thinking" });
    } else if (event.type === "tool") {
      setStatus({ phase: "tool", toolName: event.name });
    } else if (event.type === "done") {
      const answer = event.answer ?? "";
      setEntries((current) => {
        const next: Entry[] = [...current];
        // Show the assistant's words when it said any (a propose turn may be silent).
        if (answer.trim()) {
          next.push({ kind: "assistant", text: answer, toolsUsed: event.toolsUsed ?? [] });
        } else if (!event.proposal) {
          next.push({ kind: "assistant", text: answer, toolsUsed: event.toolsUsed ?? [] });
        }
        // A prepared write → a confirm card. Voice and typed turns both land here,
        // so a voice-initiated write still surfaces the card (never auto-runs).
        if (event.proposal) {
          next.push({
            kind: "proposal",
            id: (proposalIdRef.current += 1),
            proposal: event.proposal,
            status: "pending",
          });
        }
        return next;
      });
      if (speak && speakerRef.current && answer.trim()) {
        setStatus({ phase: "speaking" });
        speakerRef.current.speak(answer, { onEnd: () => setStatus(null) });
      } else {
        setStatus(null);
      }
      scrollToEnd();
    } else if (event.type === "error") {
      setEntries((current) => [...current, { kind: "error", text: event.message }]);
      setStatus(null);
      scrollToEnd();
    }
  }

  /** Drive an NDJSON event stream from a fetch, applying each event as it arrives. */
  async function consumeStream(doFetch: () => Promise<Response>, speak: boolean) {
    let response: Response;
    try {
      response = await doFetch();
    } catch {
      applyEvent({ type: "error", message: GENERIC_ERROR }, false);
      return;
    }

    if (response.status === 404) {
      applyEvent({ type: "error", message: "The assistant isn't available." }, false);
      return;
    }
    if (response.status === 401) {
      applyEvent(
        { type: "error", message: "Your session ended. Sign in again to use the assistant." },
        false,
      );
      return;
    }
    if (!response.body) {
      applyEvent({ type: "error", message: GENERIC_ERROR }, false);
      return;
    }

    // Parse the NDJSON event stream line by line as it arrives. This also covers
    // single-line error responses (e.g. a too-long recording → 413), so their
    // specific message reaches the operator.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawTerminal = false;

    const drainLine = (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      try {
        const event = JSON.parse(text) as StreamEvent;
        if (event.type === "done" || event.type === "error") sawTerminal = true;
        applyEvent(event, speak);
      } catch {
        // Ignore an unparseable partial; the terminal check below covers a truncated stream.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        drainLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    drainLine(buffer);

    // Defensive: a stream that ended without a done/error (e.g. dropped
    // connection) must not leave the UI stuck.
    if (!sawTerminal) {
      applyEvent({ type: "error", message: GENERIC_ERROR }, false);
    }
  }

  /**
   * The transcript so far as light context for the next turn. Every prepared
   * action (a confirm card) is included as a resolved assistant turn so a prior
   * request never looks unanswered — otherwise the model re-emits the stale
   * proposal on a later turn (TT-027). buildAgentHistory also keeps the roles
   * strictly alternating for the Anthropic adapter.
   */
  function historyFromEntries(): AgentTurn[] {
    return buildAgentHistory(entries);
  }

  function updateProposal(
    id: number,
    patch: { status: ConfirmCardStatus; message?: string },
  ) {
    setEntries((current) =>
      current.map((entry) =>
        entry.kind === "proposal" && entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }

  // Confirm tap → the ONLY write path. Calls the gated confirm action and shows
  // its result. The card is replaced by its terminal state; it can't re-fire.
  async function onConfirmProposal(id: number, proposal: AgentProposal) {
    updateProposal(id, { status: "confirming" });
    try {
      const result = await confirmAgentProposal(proposal);
      updateProposal(id, { status: result.status, message: result.message });
    } catch {
      updateProposal(id, {
        status: "error",
        message: "That action couldn't be completed. Nothing was saved.",
      });
    }
    scrollToEnd();
  }

  // Cancel tap → writes NOTHING. It only dismisses the card; no action is called.
  function onCancelProposal(id: number) {
    updateProposal(id, { status: "cancelled" });
  }

  // The operator's question this answer responded to — their nearest preceding turn.
  function questionFor(index: number): string {
    for (let i = index - 1; i >= 0; i -= 1) {
      const prior = entries[i];
      if (prior.kind === "user") return prior.text;
    }
    return "";
  }

  // Record one agent.feedback audit event (best-effort). toolsUsed comes off the
  // answer; a thumbs-down may carry Sam's optional note on the SAME event.
  async function recordFeedback(index: number, rating: FeedbackRating, note?: string) {
    const entry = entries[index];
    if (!entry || entry.kind !== "assistant") return;
    try {
      await recordAgentFeedback({
        rating,
        question: questionFor(index),
        toolsUsed: entry.toolsUsed,
        note,
      });
    } catch {
      // Feedback is best-effort telemetry — never surface an error to the operator.
    }
  }

  // Thumbs up/down under an answer. Thumbs-UP is instant: collapse to a thank-you
  // and record immediately. Thumbs-DOWN defers the write — it reveals the optional
  // note box first (awaitingNote) and records on Send/Skip, so the note rides the
  // SAME audit event. Rating once is enough; the control won't re-fire after.
  function onRateAnswer(index: number, rating: FeedbackRating) {
    const entry = entries[index];
    if (!entry || entry.kind !== "assistant" || entry.rated) return;
    if (rating === "down") {
      setEntries((current) =>
        current.map((item, i) =>
          i === index && item.kind === "assistant"
            ? { ...item, rated: "down", awaitingNote: true }
            : item,
        ),
      );
      return;
    }
    setEntries((current) =>
      current.map((item, i) =>
        i === index && item.kind === "assistant" ? { ...item, rated: "up" } : item,
      ),
    );
    void recordFeedback(index, "up");
  }

  // Send the note → record the thumbs-down WITH the (optional) note, then collapse.
  // An empty/whitespace note records the same as Skip — the down is never lost.
  function onSubmitNote(index: number, note: string) {
    setEntries((current) =>
      current.map((item, i) =>
        i === index && item.kind === "assistant" ? { ...item, awaitingNote: false } : item,
      ),
    );
    void recordFeedback(index, "down", note.trim() || undefined);
  }

  // Skip the note → still record the thumbs-down (no note), then collapse.
  function onSkipNote(index: number) {
    setEntries((current) =>
      current.map((item, i) =>
        i === index && item.kind === "assistant" ? { ...item, awaitingNote: false } : item,
      ),
    );
    void recordFeedback(index, "down");
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending || recording) return;

    const history = historyFromEntries();
    setEntries((current) => [...current, { kind: "user", text: trimmed }]);
    setDraft("");
    setPending(true);
    setStatus({ phase: "thinking" });
    scrollToEnd();

    void consumeStream(
      () =>
        fetch("/api/assistant/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
        }),
      false, // typed turns are never spoken back
    ).finally(() => {
      setPending(false);
      setStatus((current) => (current?.phase === "speaking" ? current : null));
    });
  }

  // --- Voice input -----------------------------------------------------------

  async function startRecording() {
    if (pending || recording) return;
    // Prime speech synthesis inside this user gesture so a later async speak()
    // (after the round-trip) isn't dropped on iOS.
    if (speakEnabledRef.current) speakerRef.current?.prime();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      // Denied or unavailable: show why, and leave typing as the path forward.
      setEntries((current) => [
        ...current,
        { kind: "error", text: friendlyMicError(error as { name?: string }) },
      ]);
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickRecordingMimeType((type) =>
      typeof window.MediaRecorder?.isTypeSupported === "function"
        ? window.MediaRecorder.isTypeSupported(type)
        : false,
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
      stopTracks();
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      chunksRef.current = [];
      void sendVoice(blob);
    };

    recorder.start();
    setRecording(true);
    // The composer itself becomes the "Listening…" indicator (an aria-live pill)
    // while recording, so we don't also stack a transcript status bubble.
    setStatus(null);
    // Hard stop so a forgotten-open mic can't record forever.
    recordTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  async function sendVoice(blob: Blob) {
    setRecording(false);
    if (blob.size === 0) {
      setStatus(null);
      return;
    }
    const speak = speakEnabledRef.current && speakSupported;
    const history = historyFromEntries();
    const form = new FormData();
    form.append("audio", blob, "voice");
    form.append("history", JSON.stringify(history));

    setPending(true);
    setStatus({ phase: "transcribing" });
    scrollToEnd();

    void consumeStream(
      () => fetch("/api/assistant/voice", { method: "POST", body: form }),
      speak,
    ).finally(() => {
      setPending(false);
      // Keep the "Speaking…" indicator if TTS is mid-sentence; otherwise clear.
      setStatus((current) => (current?.phase === "speaking" ? current : null));
    });
  }

  function onMicTap() {
    if (recording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }

  function toggleSpeak() {
    setSpeakEnabled((on) => {
      const next = !on;
      if (!next) {
        speakerRef.current?.cancel();
        setStatus((current) => (current?.phase === "speaking" ? null : current));
      }
      return next;
    });
  }

  const micAvailable = voiceSupport?.supported === true;
  const draftHasText = draft.trim() !== "";
  // ONE round control morphs through the turn: Stop while recording, Send once
  // there's text to send, otherwise Talk (the mic) when voice is available.
  const composerMode: "stop" | "send" | "talk" = recording
    ? "stop"
    : draftHasText
      ? "send"
      : micAvailable
        ? "talk"
        : "send";
  const intro = assistantIntroCopy(writesEnabled);

  return (
    // Self-contained chat panel. Full-screen route: it FILLS the available space
    // via the flex chain (layout wrapper → main → this box are all flex-col with
    // flex-1), so the panel bottom always lands inside the wrapper's nav-reserved
    // padding — clearing the fixed BottomNav whatever chrome sits above (banner,
    // header, the iPhone install prompt). Embedded: instead of filling a pinned
    // 100dvh chain (which it can't assume inside a body-scrolling page), it caps
    // its own height and scrolls the transcript internally. Either way the header
    // + subtitle are pinned rows; the transcript scrolls between them and the
    // composer (the panel's last row); the list carries bottom scroll room (plus
    // iOS safe-area) so the final confirm card's buttons AND result clear it.
    <div
      className={
        embedded
          ? "flex max-h-[70svh] flex-col overflow-hidden rounded-2xl border border-line bg-canvas"
          : "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-canvas"
      }
    >
      {/* Header — assistant identity, with the read-aloud control as a pill. */}
      <div className="flex items-center gap-2.5 border-b border-line bg-surface px-4 py-3">
        <AssistantAvatar size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[15px] font-semibold text-ink">Assistant</p>
          <p className="truncate text-xs text-ink-faint">Tidy Tails</p>
        </div>
        {speakSupported ? (
          <button
            type="button"
            onClick={toggleSpeak}
            aria-pressed={speakEnabled}
            aria-label={speakEnabled ? "Mute spoken answers" : "Unmute spoken answers"}
            title={speakEnabled ? "Spoken answers on" : "Spoken answers off"}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
              speakEnabled
                ? "border-brand-line bg-brand-soft text-brand active:bg-brand-line"
                : "border-line bg-canvas text-ink-soft active:bg-brand-soft"
            }`}
          >
            {speakEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
            <span>{speakEnabled ? "Read aloud" : "Muted"}</span>
          </button>
        ) : null}
      </div>

      {/* Truthful, flag-aware capability line — stays visible after the empty
          state scrolls away, so the read-only disclosure never disappears. */}
      <p className="border-b border-line bg-surface px-4 py-2 text-xs leading-snug text-ink-soft">
        {intro.subtitle}
      </p>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {entries.length === 0 ? (
          <div className="mt-4 flex flex-col items-center text-center">
            <AssistantAvatar size={44} />
            <p className="mt-3 max-w-[18rem] text-sm text-ink-soft">
              {intro.emptyState}
              {micAvailable ? " Tap the mic to ask out loud." : null}
            </p>
            <div className="mt-4 flex w-full flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  disabled={pending || recording}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-sm font-medium text-ink-soft shadow-soft transition-colors active:border-brand-line active:bg-brand-soft active:text-brand disabled:opacity-60"
                >
                  <SparkIcon />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {entries.map((entry, index) =>
          entry.kind === "proposal" ? (
            <div key={index} className="flex justify-start">
              <AssistantConfirmCard
                proposal={entry.proposal}
                status={entry.status}
                message={entry.message}
                onConfirm={() => onConfirmProposal(entry.id, entry.proposal)}
                onCancel={() => onCancelProposal(entry.id)}
              />
            </div>
          ) : entry.kind === "assistant" ? (
            <div key={index} className="flex items-start gap-2.5">
              <AssistantAvatar size={28} />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                <AssistantBubble entry={entry} />
                {entry.text.trim() ? (
                  <AnswerFeedback
                    rated={entry.rated ?? null}
                    awaitingNote={entry.awaitingNote ?? false}
                    onRate={(rating) => onRateAnswer(index, rating)}
                    onSubmitNote={(note) => onSubmitNote(index, note)}
                    onSkipNote={() => onSkipNote(index)}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <Bubble key={index} entry={entry} />
          ),
        )}

        {status ? <AssistantStatus phase={status.phase} toolName={status.toolName} /> : null}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-center gap-2.5 border-t border-line bg-surface px-3.5 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <label className="sr-only" htmlFor="assistant-input">
          Message the assistant
        </label>

        {recording ? (
          // While recording, the composer itself IS the "Listening…" indicator.
          <div
            aria-live="polite"
            className="flex min-h-[46px] flex-1 items-center gap-2.5 rounded-xl border border-brand-line bg-brand-soft px-3.5 text-sm font-semibold text-brand"
          >
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
            </span>
            <span>Listening…</span>
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" />
            </span>
          </div>
        ) : (
          <textarea
            id="assistant-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            placeholder="Ask about your business…"
            className="max-h-32 min-h-[46px] flex-1 resize-none rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-brand focus:bg-surface"
          />
        )}

        {composerMode === "stop" ? (
          <button
            type="button"
            onClick={stopRecording}
            aria-pressed
            aria-label="Stop recording"
            className="tt-fab shrink-0 active:bg-brand-ink"
          >
            <StopIcon />
          </button>
        ) : composerMode === "talk" ? (
          <button
            type="button"
            onClick={onMicTap}
            disabled={pending}
            aria-label="Ask by voice"
            className="tt-fab shrink-0 active:bg-brand-ink disabled:bg-canvas disabled:text-ink-faint disabled:shadow-none"
          >
            <MicIcon />
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending || recording || !draftHasText}
            aria-label="Send"
            className="tt-fab shrink-0 active:bg-brand-ink disabled:bg-canvas disabled:text-ink-faint disabled:shadow-none"
          >
            <SendArrowIcon />
          </button>
        )}
      </form>
    </div>
  );
}

// The assistant's identity mark — a brand-soft sparkle, sized per context
// (header, transcript bubble, empty state).
function AssistantAvatar({ size = 28 }: { size?: number }) {
  const icon = Math.round(size * 0.52);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="currentColor">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      </svg>
    </span>
  );
}

function Bubble({ entry }: { entry: Extract<Entry, { kind: "user" | "error" }> }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-brand px-3.5 py-2.5 text-sm leading-relaxed text-white">
          {entry.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm leading-relaxed text-danger-ink">
        {entry.text}
      </div>
    </div>
  );
}

// The assistant's reply bubble (rendered beside its avatar) plus the quiet
// "looked things up" footnote.
function AssistantBubble({ entry }: { entry: Extract<Entry, { kind: "assistant" }> }) {
  return (
    <>
      <div className="max-w-full whitespace-pre-wrap rounded-[16px_16px_16px_4px] border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-soft">
        {entry.text}
      </div>
      {entry.toolsUsed.length > 0 ? (
        <span className="px-1 text-xs text-ink-faint">
          Done · looked up {entry.toolsUsed.length === 1 ? "1 thing" : `${entry.toolsUsed.length} things`}
        </span>
      ) : null}
    </>
  );
}

// A small brand sparkle used to lead the empty-state suggestion chips.
function SparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-brand"
    >
      <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

// --- Icons (inline, no dependency) -------------------------------------------

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

function SpeakerOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
