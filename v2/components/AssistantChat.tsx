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
import { AssistantStatus, type AssistantStatusPhase } from "@/components/AssistantStatus";
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
  | { kind: "assistant"; text: string; toolsUsed: string[] }
  | { kind: "error"; text: string };

/** The in-flight live state shown while a turn streams (or while listening / speaking). */
type LiveStatus = { phase: AssistantStatusPhase; toolName?: string };

type StreamEvent =
  | { type: "transcript"; text: string }
  | { type: "thinking" }
  | { type: "tool"; name: string }
  | { type: "done"; answer: string; toolsUsed?: string[] }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "What does my day look like?",
  "What clipper did I use last time?",
  "How much did I make today?",
];

const GENERIC_ERROR = "Something went wrong answering that. Please try again.";

export function AssistantChat() {
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
      setEntries((current) => [
        ...current,
        { kind: "assistant", text: answer, toolsUsed: event.toolsUsed ?? [] },
      ]);
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

  /** The transcript so far as plain user/assistant turns — light context for the next turn. */
  function historyFromEntries(): AgentTurn[] {
    return entries
      .filter((entry): entry is Entry & { kind: "user" | "assistant" } =>
        entry.kind === "user" || entry.kind === "assistant",
      )
      .map((entry) => ({ role: entry.kind, text: entry.text }));
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
    setStatus({ phase: "listening" });
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

  return (
    // Self-contained chat panel: a fixed dynamic-viewport height leaves room for
    // the app header and the fixed bottom nav, the transcript scrolls inside,
    // and the composer is the panel's last row (above the nav, not page-fixed).
    <div className="flex h-[calc(100dvh-12rem)] flex-col overflow-hidden rounded-2xl border border-line bg-canvas">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {entries.length === 0 ? (
          <div className="mt-6 text-center">
            <p className="text-sm text-ink-soft">
              Ask about your schedule, a household, a dog&apos;s history and groom
              notes, your income, or who&apos;s due for a rebooking.
              {micAvailable ? " Tap the mic to ask out loud." : null}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  disabled={pending || recording}
                  className="rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-sm font-medium text-ink-soft active:bg-brand-soft disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {entries.map((entry, index) => (
          <Bubble key={index} entry={entry} />
        ))}

        {status ? <AssistantStatus phase={status.phase} toolName={status.toolName} /> : null}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line bg-surface px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        {speakSupported ? (
          <button
            type="button"
            onClick={toggleSpeak}
            aria-pressed={speakEnabled}
            aria-label={speakEnabled ? "Mute spoken answers" : "Unmute spoken answers"}
            title={speakEnabled ? "Spoken answers on" : "Spoken answers off"}
            className="grid min-h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-canvas text-ink-soft active:bg-brand-soft"
          >
            {speakEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          </button>
        ) : null}

        <label className="sr-only" htmlFor="assistant-input">
          Message the assistant
        </label>
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
          placeholder={recording ? "Listening…" : "Ask about your business…"}
          disabled={recording}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
        />

        {micAvailable ? (
          <button
            type="button"
            onClick={onMicTap}
            disabled={pending && !recording}
            aria-pressed={recording}
            aria-label={recording ? "Stop recording" : "Ask by voice"}
            className={`grid min-h-11 w-11 shrink-0 place-items-center rounded-xl text-white disabled:bg-canvas disabled:text-ink-faint ${
              recording ? "animate-pulse bg-danger" : "bg-brand active:bg-brand-ink"
            }`}
          >
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
        ) : null}

        <button
          type="submit"
          disabled={pending || recording || draft.trim() === ""}
          className="min-h-11 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white active:bg-brand-ink disabled:bg-canvas disabled:text-ink-faint"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({ entry }: { entry: Entry }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-brand px-4 py-2.5 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger-ink">
          {entry.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-[85%] flex-col items-start gap-1">
      <div className="whitespace-pre-wrap rounded-2xl bg-surface px-4 py-2.5 text-sm text-ink shadow-sm">
        {entry.text}
      </div>
      {entry.toolsUsed.length > 0 ? (
        <span className="px-1 text-xs text-ink-faint">
          Done · looked up {entry.toolsUsed.length === 1 ? "1 thing" : `${entry.toolsUsed.length} things`}
        </span>
      ) : null}
    </div>
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
