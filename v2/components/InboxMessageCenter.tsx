"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  sendMessageCenterSmsMessage,
  type InboxActionState,
} from "@/lib/actions/inbox";
import { formatDateTime, formatPhone, fullName } from "@/lib/format";
import type { SmsMessage } from "@/lib/inboundSms";
import { type SmsThread } from "@/lib/inbox";
import {
  anyComposerBusy,
  setComposerBusy,
  shouldAutoRefresh,
} from "@/lib/inboxAutoRefresh";
import { clearDraft, loadDraft, saveDraft } from "@/lib/inboxDraftStore";
import type { Appointment, Client, Pet } from "@/lib/data/types";
import {
  getMessageTemplateAvailability,
  MESSAGE_CENTER_TEMPLATE_OPTIONS,
  renderMessageCenterTemplate,
  type MessageCenterTemplateKey,
} from "@/lib/messageCenterTemplates";
import type { OperatorSettings } from "@/lib/operatorSettings";
import { buildSmsConversationView } from "@/lib/smsConversationView";
import { BackLink } from "./BackLink";
import { SmsMessages } from "./SmsMessages";
import { SubmitDogOverlay } from "./SubmitDog";

const MESSAGE_MAX = 480;
const INITIAL_STATE: InboxActionState = { status: "idle" };

type ClientSummary = Pick<Client, "id" | "first_name" | "last_name" | "phone" | "created_at"> & {
  pets: Pet[];
  appointments: Appointment[];
  isExistingHousehold: boolean;
  firstPlatformAlreadySent: boolean;
};

export function InboxMessageCenter({
  threads,
  messages,
  clients,
  settings,
  operatorName,
  activeThreadKey: initialActiveThreadKey,
  standalone = false,
}: {
  threads: SmsThread[];
  messages: SmsMessage[];
  clients: ClientSummary[];
  settings: OperatorSettings;
  operatorName: string;
  activeThreadKey?: string;
  standalone?: boolean;
}) {
  const router = useRouter();
  const [draftActiveThreadKey, setDraftActiveThreadKey] = useState(
    threads[0]?.key ?? "",
  );
  const activeThreadKey =
    standalone && initialActiveThreadKey
      ? initialActiveThreadKey
      : draftActiveThreadKey;
  // TT-020: a stable per-thread key for this composer's draft.
  const composerKey = `composer:${activeThreadKey}`;
  const [selectedNewClientId, setSelectedNewClientId] = useState(clients[0]?.id ?? "");
  const [clientSearch, setClientSearch] = useState("");
  // Seed from the draft store so a refresh-driven remount recovers typed text
  // (empty on first load → no hydration divergence from the empty textarea).
  const [message, setMessage] = useState(() => loadDraft(composerKey));
  const [templateKey, setTemplateKey] = useState<MessageCenterTemplateKey | "">("");
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [statusThreadKey, setStatusThreadKey] = useState("");
  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  useEffect(() => {
    // TT-020: never run the 10s auto-refresh over an in-use composer (here or in
    // the per-message InboxSmsActions) — it would re-render and wipe typed text.
    const refreshWhenVisible = () => {
      if (
        shouldAutoRefresh({
          visible: document.visibilityState === "visible",
          composerBusy: anyComposerBusy(),
        })
      ) {
        router.refresh();
      }
    };
    const interval = window.setInterval(refreshWhenVisible, 10000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  // TT-020: persist this composer's draft per thread and pause the auto-refresh
  // while it holds unsent text, so a refresh-driven remount can recover it.
  // No setState here — only external-store writes from the latest state.
  useEffect(() => {
    saveDraft(composerKey, message);
    setComposerBusy(composerKey, message.trim().length > 0);
  }, [composerKey, message]);

  // Release the busy flag on unmount so a torn-down composer never wedges the
  // refresh off. Cleanup-only — no setState in the effect body.
  useEffect(() => () => setComposerBusy(composerKey, false), [composerKey]);

  async function submitMessage(
    previousState: InboxActionState,
    formData: FormData,
  ): Promise<InboxActionState> {
    const submittingThreadKey = activeThread?.key ?? newThreadKey(selectedNewClientId);
    setStatusThreadKey(submittingThreadKey);
    const nextState = await sendMessageCenterSmsMessage(previousState, formData);
    if (nextState.status === "sent") {
      setMessage("");
      setTemplateKey("");
      clearDraft(composerKey);
      setComposerBusy(composerKey, false);
      if (!activeThread && selectedNewClientId) {
        setDraftActiveThreadKey(`client:${selectedNewClientId}`);
      }
      router.refresh();
    }
    return nextState;
  }

  const [state, formAction, pending] = useActionState<InboxActionState, FormData>(
    submitMessage,
    INITIAL_STATE,
  );

  const selectedThreadKey = threads.some((thread) => thread.key === activeThreadKey)
    ? activeThreadKey
    : threads[0]?.key ?? "";
  const activeThread =
    activeThreadKey.startsWith("new:")
      ? undefined
      : threads.find((thread) => thread.key === selectedThreadKey);
  const activeMessages = activeThread
    ? messages
        .filter((smsMessage) => messageBelongsToThread(smsMessage, activeThread.key))
        .sort((a, b) => Date.parse(messageCreatedAt(a)) - Date.parse(messageCreatedAt(b)))
    : [];
  const activeClient = activeThread?.clientId
    ? clientsById.get(activeThread.clientId) ?? null
    : clientsById.get(selectedNewClientId) ?? null;
  const ownerName = activeClient ? fullName(activeClient.first_name, activeClient.last_name) : "Unknown owner";
  const latestInbound = [...activeMessages]
    .reverse()
    .find((smsMessage) => smsMessage.direction === "inbound");
  const conversationView = buildSmsConversationView({
    messages: activeMessages,
    showAll: showAllMessages,
  });
  const trimmedLength = message.trim().length;
  const tooLong = trimmedLength > MESSAGE_MAX;
  const canSend = Boolean(activeClient || latestInbound);
  const showActionState = statusThreadKey === (activeThread?.key ?? newThreadKey(selectedNewClientId));
  const filteredClients = clients.filter((client) =>
    `${fullName(client.first_name, client.last_name)} ${client.phone} ${client.pets.map((pet) => pet.name).join(" ")}`
      .toLowerCase()
      .includes(clientSearch.trim().toLowerCase()),
  );

  if (!standalone) {
    return (
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">
            Message threads
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Open a customer conversation to text in a focused thread.
          </p>
        </div>

        <div className="overflow-hidden tt-card">
          <div className="border-b border-line p-3">
            <button
              type="button"
              onClick={startNewText}
              className="tt-btn tt-btn-primary w-full"
            >
              New text
            </button>
          </div>

          {activeThreadKey.startsWith("new:") ? (
            <div className="space-y-3 border-b border-line p-4">
              <NewThreadOwnerPicker
                clientSearch={clientSearch}
                setClientSearch={setClientSearch}
                filteredClients={filteredClients}
                activeClientId={activeClient?.id ?? null}
                selectNewClient={selectNewClient}
              />
              <ThreadComposer
                formAction={formAction}
                pending={pending}
                state={state}
                showActionState={showActionState}
                activeClient={activeClient}
                latestInbound={latestInbound}
                templateKey={templateKey}
                message={message}
                setMessage={setMessage}
                composerKey={composerKey}
                ownerName={ownerName}
                canSend={canSend}
                tooLong={tooLong}
                trimmedLength={trimmedLength}
                insertTemplate={insertTemplate}
              />
              <p className="rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
                This will start a new message thread after you send.
              </p>
            </div>
          ) : null}

          {threads.length ? (
            <ul>
              {threads.map((thread) => (
                <li key={thread.key} className="border-b border-line last:border-b-0">
                  <Link
                    href={thread.href ?? `/inbox/${encodeURIComponent(thread.key)}`}
                    className="block px-4 py-3 active:bg-canvas"
                  >
                    <ThreadPreview
                      thread={thread}
                      name={threadName(thread, clientsById)}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-sm text-ink-soft">
              No owner text threads have been captured yet.
            </p>
          )}
        </div>
      </section>
    );
  }

  function startNewText() {
    const nextClientId = selectedNewClientId || clients[0]?.id || "";
    setSelectedNewClientId(nextClientId);
    setDraftActiveThreadKey(newThreadKey(nextClientId));
    setMessage("");
    setTemplateKey("");
    setShowAllMessages(false);
  }

  function selectNewClient(clientId: string) {
    setSelectedNewClientId(clientId);
    setDraftActiveThreadKey(newThreadKey(clientId));
    setMessage("");
    setTemplateKey("");
  }

  function insertTemplate(nextTemplateKey: MessageCenterTemplateKey) {
    if (!activeClient) return;
    const availability = getMessageTemplateAvailability({
      key: nextTemplateKey,
      isExistingHousehold: activeClient.isExistingHousehold,
      firstPlatformAlreadySent: activeClient.firstPlatformAlreadySent,
    });
    if (availability.disabled) return;
    setTemplateKey(nextTemplateKey);
    setMessage(
      renderMessageCenterTemplate({
        key: nextTemplateKey,
        settings,
        operatorName,
        client: activeClient,
        pets: activeClient.pets,
        appointments: activeClient.appointments,
      }),
    );
  }

  return (
    <section className="mb-8">
      <div className="mb-4">
        <BackLink href="/inbox" label="Messages" />
      </div>

      <div className="overflow-hidden tt-card">
        <div className="min-w-0">
          {activeThread || activeThreadKey.startsWith("new:") ? (
            <div className="space-y-3 p-4">
              {!activeThread ? (
                <NewThreadOwnerPicker
                  clientSearch={clientSearch}
                  setClientSearch={setClientSearch}
                  filteredClients={filteredClients}
                  activeClientId={activeClient?.id ?? null}
                  selectNewClient={selectNewClient}
                />
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-ink">{ownerName}</h3>
                  <p className="mt-1 text-xs font-medium text-ink-soft">
                    {formatPhone(activeThread?.phone ?? activeClient?.phone ?? "")}
                  </p>
                </div>
                {activeThread && activeThread.actionCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-bold text-warn">
                    {activeThread.actionCount} new
                  </span>
                ) : null}
              </div>

              <ThreadComposer
                formAction={formAction}
                pending={pending}
                state={state}
                showActionState={showActionState}
                activeClient={activeClient}
                latestInbound={latestInbound}
                templateKey={templateKey}
                message={message}
                setMessage={setMessage}
                composerKey={composerKey}
                ownerName={ownerName}
                canSend={canSend}
                tooLong={tooLong}
                trimmedLength={trimmedLength}
                insertTemplate={insertTemplate}
              />

              <div className="space-y-2">
                {activeThread && conversationView.canToggleHistory ? (
                  <button
                    type="button"
                    onClick={() => setShowAllMessages((value) => !value)}
                    className="tt-btn tt-btn-secondary w-full"
                    aria-expanded={showAllMessages}
                  >
                    {conversationView.toggleLabel}
                  </button>
                ) : null}
                {activeThread ? (
                  <SmsMessages
                    messages={conversationView.visibleMessages}
                    emptyText="No texts recorded in this thread yet."
                    canHide
                  />
                ) : (
                  <p className="rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
                    This will start a new message thread after you send.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="p-5 text-sm text-ink-soft">
              Select a message thread to view the conversation.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ThreadPreview({ thread, name }: { thread: SmsThread; name: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-black text-brand">
        {threadInitial(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{name}</p>
            <p className="mt-0.5 text-xs font-medium text-ink-faint">
              {formatPhone(thread.phone)}
            </p>
          </div>
          <p className="shrink-0 text-xs font-medium text-ink-faint">
            {formatDateTime(thread.latestAt)}
          </p>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">
          {thread.latestDirection === "outbound" ? "You: " : ""}
          {thread.latestBody}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink-faint">
          <span>
            {thread.messageCount} text{thread.messageCount === 1 ? "" : "s"}
          </span>
          {thread.actionCount > 0 ? (
            <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn">
              {thread.actionCount} new
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NewThreadOwnerPicker({
  clientSearch,
  setClientSearch,
  filteredClients,
  activeClientId,
  selectNewClient,
}: {
  clientSearch: string;
  setClientSearch: (value: string) => void;
  filteredClients: ClientSummary[];
  activeClientId: string | null;
  selectNewClient: (clientId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">Owner</span>
        <input
          type="search"
          value={clientSearch}
          onChange={(event) => setClientSearch(event.currentTarget.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="Search owner, phone, or pet"
        />
      </label>
      <div className="mt-2 max-h-44 overflow-auto rounded-lg border border-line bg-surface">
        {filteredClients.slice(0, 12).map((client) => (
          <button
            key={client.id}
            type="button"
            onClick={() => selectNewClient(client.id)}
            className={`block w-full border-b border-line px-3 py-2 text-left text-sm last:border-b-0 active:bg-canvas ${
              activeClientId === client.id ? "bg-brand-soft/50" : ""
            }`}
          >
            <span className="block font-semibold text-ink">
              {fullName(client.first_name, client.last_name)}
            </span>
            <span className="block text-xs text-ink-soft">
              {formatPhone(client.phone)}
              {client.pets[0]?.name ? ` · ${client.pets[0].name}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThreadComposer({
  formAction,
  pending,
  state,
  showActionState,
  activeClient,
  latestInbound,
  templateKey,
  message,
  setMessage,
  composerKey,
  ownerName,
  canSend,
  tooLong,
  trimmedLength,
  insertTemplate,
}: {
  formAction: (payload: FormData) => void;
  pending: boolean;
  state: InboxActionState;
  showActionState: boolean;
  activeClient: ClientSummary | null;
  latestInbound: SmsMessage | undefined;
  templateKey: MessageCenterTemplateKey | "";
  message: string;
  setMessage: (message: string) => void;
  composerKey: string;
  ownerName: string;
  canSend: boolean;
  tooLong: boolean;
  trimmedLength: number;
  insertTemplate: (key: MessageCenterTemplateKey) => void;
}) {
  return (
    <form action={formAction} className="relative rounded-xl border border-line bg-canvas p-3.5">
      <SubmitDogOverlay label="Sending text" show={pending} />
      <input type="hidden" name="client_id" value={activeClient?.id ?? ""} />
      <input type="hidden" name="reply_sms_id" value={latestInbound?.id ?? ""} />
      <input type="hidden" name="message" value={message} />
      <input type="hidden" name="template_key" value={templateKey} />

      {showActionState && state.status === "error" ? (
        <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {state.message}
        </p>
      ) : null}
      {showActionState && state.status === "sent" ? (
        <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink">
          {state.message}
        </p>
      ) : null}

      <div className="space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-sm font-medium text-ink-soft" htmlFor="message-center-body">
            Message to {ownerName}
          </label>
          <TemplatePicker client={activeClient} onInsert={insertTemplate} />
        </div>
        <textarea
          id="message-center-body"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          onFocus={() => setComposerBusy(composerKey, true)}
          onBlur={() => setComposerBusy(composerKey, message.trim().length > 0)}
          maxLength={MESSAGE_MAX}
          className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder={
            canSend
              ? "Write your text..."
              : "Match this phone number to an owner before texting."
          }
          disabled={!canSend || pending}
        />
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs ${tooLong ? "text-danger-ink" : "text-ink-faint"}`}>
            {trimmedLength}/{MESSAGE_MAX}
          </span>
          <button
            type="submit"
            disabled={pending || !message.trim() || tooLong || !canSend}
            className="tt-btn tt-btn-primary"
          >
            Send
          </button>
        </div>
      </div>
    </form>
  );
}

function TemplatePicker({
  client,
  onInsert,
}: {
  client: ClientSummary | null;
  onInsert: (key: MessageCenterTemplateKey) => void;
}) {
  return (
    <label className="shrink-0">
      <span className="sr-only">Choose a saved message</span>
      <select
        value=""
        onChange={(event) => {
          const value = event.currentTarget.value as MessageCenterTemplateKey | "";
          if (value) onInsert(value);
        }}
        disabled={!client}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50 sm:w-56"
      >
        <option value="">Saved message...</option>
        {MESSAGE_CENTER_TEMPLATE_OPTIONS.map((option) => {
          const availability = client
            ? getMessageTemplateAvailability({
                key: option.key,
                isExistingHousehold: client.isExistingHousehold,
                firstPlatformAlreadySent: client.firstPlatformAlreadySent,
              })
            : ({ disabled: true, reason: "Choose an owner first." } as const);
          return (
            <option
              key={option.key}
              value={option.key}
              disabled={availability.disabled}
            >
              {option.label}
              {availability.disabled ? ` - ${availability.reason}` : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function messageBelongsToThread(message: SmsMessage, threadKey: string): boolean {
  if (threadKey.startsWith("client:")) return message.client_id === threadKey.slice("client:".length);
  const phone = threadKey.slice("phone:".length);
  const messagePhone = message.direction === "inbound" ? message.from_phone : message.to_phone;
  return messagePhone === phone;
}

function newThreadKey(clientId: string): string {
  return clientId ? `new:${clientId}` : "new:";
}

function messageCreatedAt(message: SmsMessage): string {
  return message.received_at ?? message.sent_at ?? message.created_at;
}

function threadName(thread: SmsThread, clientsById: Map<string, ClientSummary>): string {
  if (!thread.clientId) return "Unknown owner";
  const client = clientsById.get(thread.clientId);
  return client ? fullName(client.first_name, client.last_name) : "Household linked";
}

function threadInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}
