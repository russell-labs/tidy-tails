import { loadRecentAuditEvents } from "@/lib/audit.server";
import { loadRecentBookingRequests } from "@/lib/bookingRequests.server";
import { loadAppointments } from "@/lib/data/repo";
import { buildInboxItems, inboxCounts } from "@/lib/inbox";
import {
  notificationBellCount,
  shouldShowTomorrowReviewNotification,
} from "@/lib/notifications";
import { loadRecentSmsMessages } from "@/lib/smsMessages.server";

export async function loadNotificationCount(): Promise<number> {
  const [smsMessages, bookingRequests, auditEvents, appointments] =
    await Promise.all([
      loadRecentSmsMessages(100),
      loadRecentBookingRequests(25),
      loadRecentAuditEvents(1000),
      loadAppointments(),
    ]);
  const inboxItems = buildInboxItems({
    smsMessages,
    bookingRequests,
    auditEvents,
    handledSmsIds: handledSmsIdsFromAudit(auditEvents),
  });
  const dailyReview = shouldShowTomorrowReviewNotification({ appointments }) ? 1 : 0;
  return notificationBellCount({
    inboxNeedsAction: inboxCounts(inboxItems).needsAction,
    tomorrowReviewDue: dailyReview > 0,
  });
}

function handledSmsIdsFromAudit(events: Awaited<ReturnType<typeof loadRecentAuditEvents>>) {
  return new Set(
    events
      .filter(
        (event) =>
          event.event_type === "sms.handled" ||
          event.event_type === "sms.sent",
      )
      .map((event) => event.metadata?.smsMessageId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}
