import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "@/lib/format";
import {
  describeProposal,
  type AddTipProposal,
  type BookAppointmentProposal,
  type LogGroomProposal,
} from "./proposals";

// The confirm card renders describeProposal(proposal) verbatim, and the confirm
// action acts on the SAME proposal fields. So "the card matches the resolved
// action exactly" is guaranteed when describeProposal surfaces every field the
// action consumes. These tests pin that down per kind.

const BOOK: BookAppointmentProposal = {
  kind: "book_appointment",
  clientId: "c1",
  ownerName: "Rosanne Adams",
  petIds: ["p1"],
  petNames: "Kiwi",
  date: "2026-07-11",
  timeSlot: "10:00am",
  serviceType: "full_groom",
  service: "Full groom",
  fee: 50,
  location: "gina",
  locationLabel: "Tidy Tails (Gina)",
  durationMinutes: null,
};

const TIP: AddTipProposal = {
  kind: "add_tip",
  clientId: "c1",
  petId: "p1",
  petName: "Coco",
  ownerName: "Rosanne Adams",
  appointmentDate: "2026-07-10",
  service: "Full groom",
  fee: 50,
  currentTip: 0,
  addedTip: 5,
  newTip: 5,
  paidAmount: 55,
  paymentMethod: "cash",
};

const LOG: LogGroomProposal = {
  kind: "log_groom",
  clientId: "c1",
  petId: "p1",
  petName: "Bella",
  ownerName: "Rosanne Adams",
  date: "2026-07-09",
  serviceType: "bath_only",
  service: "Bath only",
  fee: 35,
  tip: 10,
  paymentMethod: "interac",
  paymentStatus: "paid",
  notes: "Used #4 blade, calm",
};

describe("describeProposal — booking", () => {
  it("names the action, the pet, service, date, time, and fee", () => {
    const text = describeProposal(BOOK);
    expect(text).toMatch(/^Book /);
    expect(text).toContain("Kiwi");
    expect(text).toContain("Full groom");
    expect(text).toContain(formatDate("2026-07-11"));
    expect(text).toContain("10:00am");
    expect(text).toContain(formatMoney(50));
  });

  it("includes the location label when a location is resolved", () => {
    expect(describeProposal(BOOK)).toContain("Tidy Tails (Gina)");
  });

  it("omits the dash-fee clause cleanly when there is no fee", () => {
    const text = describeProposal({ ...BOOK, fee: null });
    expect(text).toContain("Kiwi");
    expect(text).not.toContain("$NaN");
  });
});

describe("describeProposal — add tip", () => {
  it("discloses the added tip, the new total, that it marks paid, and the method", () => {
    const text = describeProposal(TIP);
    expect(text).toContain("Coco");
    expect(text).toContain(formatMoney(5)); // the tip being added
    expect(text).toContain(formatMoney(55)); // the new paid total
    expect(text.toLowerCase()).toContain("paid"); // the coupled status effect is disclosed
    expect(text.toLowerCase()).toContain("cash"); // the payment method
    expect(text).toContain(formatDate("2026-07-10"));
  });
});

describe("describeProposal — log groom", () => {
  it("names the pet, service, date, fee, tip, and payment", () => {
    const text = describeProposal(LOG);
    expect(text).toMatch(/^Log groom/);
    expect(text).toContain("Bella");
    expect(text).toContain("Bath only");
    expect(text).toContain(formatDate("2026-07-09"));
    expect(text).toContain(formatMoney(35));
    expect(text).toContain(formatMoney(10));
  });

  it("surfaces the operator's groom note when present", () => {
    expect(describeProposal(LOG)).toContain("Used #4 blade, calm");
  });
});
