import type { SmsMessage } from "./inboundSms";

const DEFAULT_COLLAPSED_COUNT = 4;

export function buildSmsConversationView({
  messages,
  showAll,
  collapsedCount = DEFAULT_COLLAPSED_COUNT,
}: {
  messages: SmsMessage[];
  showAll: boolean;
  collapsedCount?: number;
}): {
  visibleMessages: SmsMessage[];
  canToggleHistory: boolean;
  toggleLabel: string | null;
} {
  const canToggleHistory = messages.length > collapsedCount;
  const visibleMessages =
    showAll || !canToggleHistory
      ? messages
      : messages.slice(Math.max(messages.length - collapsedCount, 0));
  const olderCount = Math.max(messages.length - collapsedCount, 0);

  return {
    visibleMessages,
    canToggleHistory,
    toggleLabel: canToggleHistory
      ? showAll
        ? "Show recent texts"
        : `Show ${olderCount} older text${olderCount === 1 ? "" : "s"}`
      : null,
  };
}
