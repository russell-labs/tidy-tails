import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointment,
  clientRecord,
  createSupabaseHarness,
  form,
  isoDate,
  smsRow,
} from "./actionTestSupport";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/audit.server", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/data/repo", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/data/repo")>("@/lib/data/repo");
  return {
    ...actual,
    getClientRecord: vi.fn(),
    requireOrgId: vi.fn(async () => "org-1"),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/twilio", () => ({
  getTwilioConfig: vi.fn(),
  sendTwilioSms: vi.fn(),
  toTwilioPhone: vi.fn(),
}));

import {
  hideSmsMessage,
  markSmsHandled,
  sendClientSmsMessage,
  sendInboxSmsReply,
  sendMessageCenterSmsMessage,
} from "./inbox";
import { sendReadyPickupText } from "./readyPickup";
import { prepareReminder } from "./reminders";
import { getClientRecord } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";

const supabase = createSupabaseHarness();
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const getClientRecordMock = vi.mocked(getClientRecord);
const getTwilioConfigMock = vi.mocked(getTwilioConfig);
const sendTwilioSmsMock = vi.mocked(sendTwilioSms);
const toTwilioPhoneMock = vi.mocked(toTwilioPhone);

function expectNoWritesOrSms(): void {
  expect(createServerSupabaseMock).not.toHaveBeenCalled();
  expect(supabase.operations).toEqual([]);
  expect(sendTwilioSmsMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabase.reset();
  vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");

  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
  getClientRecordMock.mockResolvedValue(
    clientRecord({
      appointments: [
        appointment({
          id: "appt-1",
          date: isoDate(3),
          time_slot: "10:30am",
          location: "gina",
        }),
      ],
    }),
  );
  getTwilioConfigMock.mockReturnValue({
    ok: true,
    value: {
      accountSid: "AC-test",
      authUsername: "SK-test",
      authPassword: "secret",
      fromNumber: "+17055550199",
    },
  });
  toTwilioPhoneMock.mockImplementation((phone: string) =>
    phone.startsWith("+") ? phone : "+17055550100",
  );
  sendTwilioSmsMock.mockResolvedValue({ ok: true, sid: "SM-outbound" });
});

describe("sendReadyPickupText", () => {
  it("sends the pickup SMS and logs the outbound message when the SMS gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");

    const result = await sendReadyPickupText(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        message: "Hi Mary, Kiwi is ready.",
      }),
    );

    expect(result).toMatchObject({ status: "sent" });
    expect(sendTwilioSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fromNumber: "+17055550199" }),
      { to: "+17055550100", body: "Hi Mary, Kiwi is ready." },
    );
    expect(supabase.operations).toEqual([
      {
        table: "sms_messages",
        action: "insert",
        payload: expect.objectContaining({
          groomer_id: "operator-1",
          org_id: "org-1",
          client_id: "client-1",
          direction: "outbound",
          from_phone: "+17055550199",
          to_phone: "+17055550100",
          body: "Hi Mary, Kiwi is ready.",
          twilio_message_sid: "SM-outbound",
          status: "sent",
          match_status: "matched",
          sent_at: expect.any(String),
        }),
        filters: [],
        orders: [],
      },
    ]);
  });

  it("returns gated and does not send or write when the SMS gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "true");

    const result = await sendReadyPickupText(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        message: "Hi Mary, Kiwi is ready.",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoWritesOrSms();
  });

  it("returns an auth error and does not send or write without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await sendReadyPickupText(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        message: "Hi Mary, Kiwi is ready.",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWritesOrSms();
  });

  it("returns validation errors and does not send or write for invalid message input", async () => {
    const result = await sendReadyPickupText(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        message: " ",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: { message: expect.any(String) },
    });
    expectNoWritesOrSms();
  });
});

describe("prepareReminder", () => {
  it("sends the reminder SMS and records both send logs when the SMS gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");

    const result = await prepareReminder(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        message: "Reminder for Kiwi tomorrow.",
      }),
    );

    expect(result).toMatchObject({ status: "sent" });
    expect(sendTwilioSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fromNumber: "+17055550199" }),
      { to: "+17055550100", body: "Reminder for Kiwi tomorrow." },
    );
    expect(supabase.operations).toEqual([
      {
        table: "automations_log",
        action: "insert",
        payload: expect.objectContaining({
          client_id: "client-1",
          type: "reminder",
          channel: "sms",
          message: "Reminder for Kiwi tomorrow.",
          status: "sent",
          sent_at: expect.any(String),
          org_id: "org-1",
        }),
        filters: [],
        orders: [],
      },
      {
        table: "sms_messages",
        action: "insert",
        payload: expect.objectContaining({
          client_id: "client-1",
          body: "Reminder for Kiwi tomorrow.",
          twilio_message_sid: "SM-outbound",
          org_id: "org-1",
        }),
        filters: [],
        orders: [],
      },
    ]);
  });

  it("returns gated and does not send or write when the SMS gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "ON");

    const result = await prepareReminder(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        message: "Reminder for Kiwi tomorrow.",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoWritesOrSms();
  });

  it("returns an auth error and does not send or write without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await prepareReminder(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        message: "Reminder for Kiwi tomorrow.",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWritesOrSms();
  });

  it("returns validation errors and does not send or write for invalid reminder input", async () => {
    const result = await prepareReminder(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        message: " ",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: { message: expect.any(String) },
    });
    expectNoWritesOrSms();
  });
});

describe("TT-007 — operator picks which household number to text", () => {
  // A realistic toTwilioPhone so the chosen number is observable in the send
  // (the default harness mock collapses everything to +17055550100).
  function realisticToTwilioPhone() {
    toTwilioPhoneMock.mockImplementation((phone: string) => {
      const digits = phone.replace(/\D/g, "");
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
      return null;
    });
  }

  describe("sendClientSmsMessage", () => {
    it("sends to the chosen secondary cell when it is on the household", async () => {
      vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");
      realisticToTwilioPhone();
      getClientRecordMock.mockResolvedValue(
        clientRecord({
          client: { alt_contact: "Secondary: Jamie - 705-555-0200" },
        }),
      );

      const result = await sendClientSmsMessage(
        { status: "idle" },
        form({
          client_id: "client-1",
          message: "Hi Jamie, see you soon.",
          to_number: "705-555-0200",
        }),
      );

      expect(result).toEqual({ status: "sent", message: "Text sent." });
      expect(sendTwilioSmsMock).toHaveBeenCalledWith(
        expect.objectContaining({ fromNumber: "+17055550199" }),
        { to: "+17055550200", body: "Hi Jamie, see you soon." },
      );
    });

    it("rejects the landline (it can't receive texts) and sends nothing", async () => {
      vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");
      realisticToTwilioPhone();
      getClientRecordMock.mockResolvedValue(
        clientRecord({ client: { alt_contact: "Landline: 705-555-0300" } }),
      );

      const result = await sendClientSmsMessage(
        { status: "idle" },
        form({
          client_id: "client-1",
          message: "Hi Mary.",
          to_number: "705-555-0300",
        }),
      );

      expect(result).toEqual({
        status: "error",
        message: "That number can't receive texts. Pick a mobile number.",
      });
      expectNoWritesOrSms();
    });

    it("rejects a number that does not belong to the household", async () => {
      vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");
      realisticToTwilioPhone();
      getClientRecordMock.mockResolvedValue(clientRecord());

      const result = await sendClientSmsMessage(
        { status: "idle" },
        form({
          client_id: "client-1",
          message: "Hi Mary.",
          to_number: "705-555-9999",
        }),
      );

      expect(result).toEqual({
        status: "error",
        message: "That number isn't on this household. No text was sent.",
      });
      expectNoWritesOrSms();
    });
  });

  describe("prepareReminder", () => {
    it("sends the reminder to the chosen secondary cell when it is on the household", async () => {
      vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");
      realisticToTwilioPhone();
      getClientRecordMock.mockResolvedValue(
        clientRecord({
          client: { alt_contact: "Secondary: Jamie - 705-555-0200" },
          appointments: [
            appointment({ id: "appt-1", date: isoDate(3), time_slot: "10:30am" }),
          ],
        }),
      );

      const result = await prepareReminder(
        { status: "idle" },
        form({
          client_id: "client-1",
          appointment_id: "appt-1",
          message: "Reminder for Kiwi tomorrow.",
          to_number: "705-555-0200",
        }),
      );

      expect(result).toMatchObject({ status: "sent" });
      expect(sendTwilioSmsMock).toHaveBeenCalledWith(
        expect.objectContaining({ fromNumber: "+17055550199" }),
        { to: "+17055550200", body: "Reminder for Kiwi tomorrow." },
      );
    });

    it("rejects the landline and prepares/sends nothing", async () => {
      vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");
      realisticToTwilioPhone();
      getClientRecordMock.mockResolvedValue(
        clientRecord({ client: { alt_contact: "Landline: 705-555-0300" } }),
      );

      const result = await prepareReminder(
        { status: "idle" },
        form({
          client_id: "client-1",
          appointment_id: "appt-1",
          message: "Reminder for Kiwi tomorrow.",
          to_number: "705-555-0300",
        }),
      );

      expect(result).toMatchObject({
        status: "error",
        formError:
          "That number can't receive texts. Pick a mobile number for this reminder.",
      });
      expectNoWritesOrSms();
    });
  });
});

describe("inbox message status actions", () => {
  it("marks an SMS handled with the scoped update payload", async () => {
    const result = await markSmsHandled(
      { status: "idle" },
      form({ sms_id: "sms-1" }),
    );

    expect(result).toEqual({ status: "handled", message: "Marked handled." });
    expect(supabase.operations).toEqual([
      {
        table: "sms_messages",
        action: "update",
        payload: {
          status: "handled",
          handled_at: expect.any(String),
        },
        filters: [
          { method: "eq", column: "id", value: "sms-1" },
          { method: "eq", column: "groomer_id", value: "operator-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns an auth error and writes nothing when marking handled without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await markSmsHandled(
      { status: "idle" },
      form({ sms_id: "sms-1" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expectNoWritesOrSms();
  });

  it("returns validation feedback and writes nothing when handled SMS id is missing", async () => {
    const result = await markSmsHandled({ status: "idle" }, form({ sms_id: "" }));

    expect(result).toEqual({
      status: "error",
      message: "Choose a customer reply first.",
    });
    expectNoWritesOrSms();
  });

  it("hides an SMS with the scoped update payload", async () => {
    supabase.queueResult({ data: { client_id: "client-1" }, error: null });

    const result = await hideSmsMessage(
      { status: "idle" },
      form({ sms_id: "sms-1" }),
    );

    expect(result).toEqual({ status: "hidden", message: "Text hidden." });
    expect(supabase.operations).toEqual([
      {
        table: "sms_messages",
        action: "update",
        payload: {
          status: "hidden",
          handled_at: expect.any(String),
        },
        filters: [
          { method: "eq", column: "id", value: "sms-1" },
          { method: "eq", column: "groomer_id", value: "operator-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns an auth error and writes nothing when hiding without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await hideSmsMessage(
      { status: "idle" },
      form({ sms_id: "sms-1" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expectNoWritesOrSms();
  });

  it("returns validation feedback and writes nothing when hidden SMS id is missing", async () => {
    const result = await hideSmsMessage({ status: "idle" }, form({ sms_id: "" }));

    expect(result).toEqual({
      status: "error",
      message: "Choose a customer text first.",
    });
    expectNoWritesOrSms();
  });
});

describe("inbox SMS reply actions", () => {
  it("sends a reply to an inbound SMS, logs outbound SMS, and marks inbound handled", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");
    supabase.queueResult({ data: smsRow(), error: null });

    const result = await sendInboxSmsReply(
      { status: "idle" },
      form({ sms_id: "sms-1", message: "Sure, what day works?" }),
    );

    expect(result).toEqual({ status: "sent", message: "Reply sent." });
    expect(sendTwilioSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fromNumber: "+17055550199" }),
      { to: "+17055550100", body: "Sure, what day works?" },
    );
    expect(supabase.operations).toEqual([
      {
        table: "sms_messages",
        action: "insert",
        payload: expect.objectContaining({
          client_id: "client-1",
          direction: "outbound",
          body: "Sure, what day works?",
          org_id: "org-1",
        }),
        filters: [],
        orders: [],
      },
      {
        table: "sms_messages",
        action: "update",
        payload: {
          status: "handled",
          handled_at: expect.any(String),
        },
        filters: [
          { method: "eq", column: "id", value: "sms-1" },
          { method: "eq", column: "groomer_id", value: "operator-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns gated and does not send or write when replying while SMS is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on ");

    const result = await sendInboxSmsReply(
      { status: "idle" },
      form({ sms_id: "sms-1", message: "Sure, what day works?" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "SMS sending is switched off. No text was sent.",
    });
    expectNoWritesOrSms();
  });

  it("returns an auth error and does not send or write when replying without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await sendInboxSmsReply(
      { status: "idle" },
      form({ sms_id: "sms-1", message: "Sure, what day works?" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expectNoWritesOrSms();
  });

  it("returns validation feedback and does not send or write for an empty reply", async () => {
    const result = await sendInboxSmsReply(
      { status: "idle" },
      form({ sms_id: "sms-1", message: "" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Write a reply before sending.",
    });
    expectNoWritesOrSms();
  });

  it("sends a household conversation SMS and logs it when SMS is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");

    const result = await sendClientSmsMessage(
      { status: "idle" },
      form({ client_id: "client-1", message: "Hi Mary, see you soon." }),
    );

    expect(result).toEqual({ status: "sent", message: "Text sent." });
    expect(sendTwilioSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fromNumber: "+17055550199" }),
      { to: "+17055550100", body: "Hi Mary, see you soon." },
    );
    expect(supabase.operations).toEqual([
      {
        table: "sms_messages",
        action: "insert",
        payload: expect.objectContaining({
          client_id: "client-1",
          body: "Hi Mary, see you soon.",
          org_id: "org-1",
        }),
        filters: [],
        orders: [],
      },
    ]);
  });

  it("returns gated and does not send or write when household SMS is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "0");

    const result = await sendClientSmsMessage(
      { status: "idle" },
      form({ client_id: "client-1", message: "Hi Mary, see you soon." }),
    );

    expect(result).toEqual({
      status: "error",
      message: "SMS sending is switched off. No text was sent.",
    });
    expectNoWritesOrSms();
  });

  it("returns an auth error and does not send or write for household SMS without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await sendClientSmsMessage(
      { status: "idle" },
      form({ client_id: "client-1", message: "Hi Mary, see you soon." }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expectNoWritesOrSms();
  });

  it("returns validation feedback and does not send or write for invalid household SMS input", async () => {
    const result = await sendClientSmsMessage(
      { status: "idle" },
      form({ client_id: "", message: "" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Choose a household first.",
    });
    expectNoWritesOrSms();
  });

  it("sends a Message Center SMS and logs it when SMS is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");

    const result = await sendMessageCenterSmsMessage(
      { status: "idle" },
      form({
        client_id: "client-1",
        message: "Hi Mary, platform intro.",
        template_key: "",
      }),
    );

    expect(result).toEqual({ status: "sent", message: "Text sent." });
    expect(sendTwilioSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fromNumber: "+17055550199" }),
      { to: "+17055550100", body: "Hi Mary, platform intro." },
    );
    expect(supabase.operations).toEqual([
      {
        table: "sms_messages",
        action: "insert",
        payload: expect.objectContaining({
          client_id: "client-1",
          body: "Hi Mary, platform intro.",
          org_id: "org-1",
        }),
        filters: [],
        orders: [],
      },
    ]);
  });

  it("returns gated and does not send or write when Message Center SMS is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "false");

    const result = await sendMessageCenterSmsMessage(
      { status: "idle" },
      form({ client_id: "client-1", message: "Hi Mary" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "SMS sending is switched off. No text was sent.",
    });
    expectNoWritesOrSms();
  });

  it("returns an auth error and does not send or write for Message Center SMS without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await sendMessageCenterSmsMessage(
      { status: "idle" },
      form({ client_id: "client-1", message: "Hi Mary" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expectNoWritesOrSms();
  });

  it("returns validation feedback and does not send or write for invalid Message Center SMS input", async () => {
    const result = await sendMessageCenterSmsMessage(
      { status: "idle" },
      form({ client_id: "client-1", message: "" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Write a text before sending.",
    });
    expectNoWritesOrSms();
  });
});
