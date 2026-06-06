import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseHarness } from "./actionTestSupport";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/data/repo", () => ({
  requireOrgId: vi.fn(async () => "org-1"),
}));

vi.mock("@/lib/twilio", () => ({
  getTwilioConfig: vi.fn(),
  sendTwilioSms: vi.fn(),
  toTwilioPhone: vi.fn(),
}));

import { sendCustomerSms } from "./sendCustomerSms";
import { createServerSupabase } from "@/lib/supabase/server";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";

const supabase = createSupabaseHarness();
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getTwilioConfigMock = vi.mocked(getTwilioConfig);
const sendTwilioSmsMock = vi.mocked(sendTwilioSms);
const toTwilioPhoneMock = vi.mocked(toTwilioPhone);

function args(
  overrides: Partial<Parameters<typeof sendCustomerSms>[0]> = {},
): Parameters<typeof sendCustomerSms>[0] {
  return {
    clientId: "client-1",
    groomerId: "operator-1",
    to: "705-555-0100",
    body: "Hi Mary, Kiwi is booked.",
    label: "Booking",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabase.reset();
  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
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

describe("sendCustomerSms", () => {
  it("is gated (no send, no write) when the SMS flag is off", async () => {
    const result = await sendCustomerSms(args());
    expect(result).toEqual({
      status: "gated",
      message: "Booking text was not sent because SMS sending is switched off.",
    });
    expect(sendTwilioSmsMock).not.toHaveBeenCalled();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
    expect(supabase.operations).toEqual([]);
  });

  it("names the kind of text via `label` in every status message", async () => {
    expect((await sendCustomerSms(args({ label: "Cancellation" }))).message).toBe(
      "Cancellation text was not sent because SMS sending is switched off.",
    );
    expect(
      (await sendCustomerSms(args({ label: "Booking update" }))).message,
    ).toBe(
      "Booking update text was not sent because SMS sending is switched off.",
    );
  });

  describe("with the SMS gate on", () => {
    beforeEach(() => {
      vi.stubEnv("TIDYTAILS_ENABLE_REMINDER_SEND", "on");
    });

    it("fails when Twilio is not configured", async () => {
      getTwilioConfigMock.mockReturnValue({ ok: false, missing: ["accountSid"] });
      const result = await sendCustomerSms(args());
      expect(result).toEqual({
        status: "failed",
        message: "Booking text was not sent because Twilio is not configured.",
      });
      expect(sendTwilioSmsMock).not.toHaveBeenCalled();
      expect(supabase.operations).toEqual([]);
    });

    it("fails when the phone number is not textable", async () => {
      toTwilioPhoneMock.mockReturnValue(null);
      const result = await sendCustomerSms(args());
      expect(result).toEqual({
        status: "failed",
        message:
          "Booking text was not sent because the customer phone number is not textable.",
      });
      expect(sendTwilioSmsMock).not.toHaveBeenCalled();
      expect(supabase.operations).toEqual([]);
    });

    it("fails and skips the ledger write when Twilio rejects the send", async () => {
      sendTwilioSmsMock.mockResolvedValue({
        ok: false,
        message: "Twilio could not send the SMS.",
      });
      const result = await sendCustomerSms(args());
      expect(result).toEqual({
        status: "failed",
        message: "Twilio could not send the SMS. Booking text was not sent.",
      });
      expect(supabase.operations).toEqual([]);
    });

    it("sends the body, logs the outbound message, and reports success", async () => {
      const result = await sendCustomerSms(args());
      expect(result).toEqual({
        status: "sent",
        message: "Booking text sent to the customer.",
      });
      expect(sendTwilioSmsMock).toHaveBeenCalledWith(
        expect.objectContaining({ fromNumber: "+17055550199" }),
        { to: "+17055550100", body: "Hi Mary, Kiwi is booked." },
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
            body: "Hi Mary, Kiwi is booked.",
            twilio_message_sid: "SM-outbound",
          }),
          filters: [],
          orders: [],
        },
      ]);
    });
  });
});
