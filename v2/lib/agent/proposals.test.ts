import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "@/lib/format";
import {
  describeProposal,
  type AddHouseholdProposal,
  type AddPetProposal,
  type AddTipProposal,
  type BookAppointmentProposal,
  type DeleteHouseholdProposal,
  type EditAppointmentProposal,
  type EditHouseholdProposal,
  type EditPetProposal,
  type LogDailyIncomeProposal,
  type LogGroomProposal,
  type SendTextProposal,
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

// ---------------------------------------------------------------------------
// Phase 4 write surface — every new kind's card must name the action and the
// fields its gated action consumes, so what Sam approves is what is performed.
// ---------------------------------------------------------------------------

const ADD_HOUSEHOLD: AddHouseholdProposal = {
  kind: "add_household",
  ownerName: "Mary Jones",
  firstName: "Mary",
  lastName: "Jones",
  phone: "705-555-0101",
  secondaryContactName: null,
  secondaryCell: null,
  landline: null,
  email: "mary@example.com",
  address: "10 Main Street",
  notes: null,
  smsConsent: false,
  pet: {
    name: "Roo",
    breed: "Corgi",
    size: "medium",
    allergies: false,
    allergiesDetail: null,
    vaccinationState: "yes",
    vaccinationDetail: "Rabies current",
    dateOfBirth: null,
    groomingNotes: null,
    typicalFee: 68,
  },
};

const ADD_PET: AddPetProposal = {
  kind: "add_pet",
  clientId: "c1",
  ownerName: "Mary Jones",
  name: "Maple",
  breed: "Poodle",
  size: "medium",
  allergies: true,
  allergiesDetail: "Chicken",
  groomingNotes: "Teddy face",
  typicalFee: 82.5,
};

const EDIT_HOUSEHOLD: EditHouseholdProposal = {
  kind: "edit_household",
  clientId: "c1",
  ownerName: "Mary Jones",
  firstName: "Mary",
  lastName: "Jones",
  phone: "705-555-9999",
  secondaryContactName: "Pat",
  secondaryCell: "705-555-0112",
  landline: null,
  email: "mary@example.com",
  address: "10 Main Street",
  notes: null,
  changes: ["phone → 705-555-9999"],
};

const EDIT_PET: EditPetProposal = {
  kind: "edit_pet",
  clientId: "c1",
  petId: "p1",
  petName: "Kiwi",
  name: "Kiwi",
  breed: "Terrier mix",
  size: "small",
  color: "Black",
  dateOfBirth: null,
  allergies: true,
  allergiesDetail: "Oatmeal shampoo only",
  groomingNotes: "Use blue bow",
  typicalFee: 75,
  changes: ["allergies → Oatmeal shampoo only"],
};

const EDIT_APPT_CHANGE: EditAppointmentProposal = {
  kind: "edit_appointment",
  mode: "reschedule_change",
  clientId: "c1",
  appointmentId: "a1",
  ownerName: "Mary Jones",
  petName: "Kiwi",
  date: "2026-07-12",
  timeSlot: "9:00am",
  serviceType: "full_groom",
  service: "Full groom",
  location: "gina",
  locationLabel: "Tidy Tails (Gina)",
  fee: 80,
  tip: null,
  paymentMethod: "cash",
  paymentStatus: "paid",
  notes: null,
  salonPayoutOverride: null,
  changes: ["date → 2026-07-12", "time → 9:00am"],
};

const EDIT_APPT_CANCEL: EditAppointmentProposal = {
  kind: "edit_appointment",
  mode: "cancel",
  clientId: "c1",
  appointmentId: "a1",
  ownerName: "Mary Jones",
  petName: "Kiwi",
  date: "2026-07-12",
  service: "Full groom",
};

const EDIT_APPT_NO_SHOW: EditAppointmentProposal = {
  kind: "edit_appointment",
  mode: "no_show",
  clientId: "c1",
  appointmentId: "a1",
  ownerName: "Mary Jones",
  petName: "Kiwi",
  date: "2026-07-12",
  service: "Full groom",
};

const DELETE_HOUSEHOLD: DeleteHouseholdProposal = {
  kind: "delete_household",
  clientId: "c1",
  ownerName: "Mary Jones",
  petNames: "Kiwi and Coco",
  petCount: 2,
  appointmentCount: 0,
  hasHistory: false,
};

const LOG_DAILY_INCOME: LogDailyIncomeProposal = {
  kind: "log_daily_income",
  date: "2026-07-12",
  location: "gina",
  locationLabel: "Tidy Tails (Gina)",
  finalPayout: 240,
  calculatedPayout: 168,
  note: "Paid by salon, kept 100%",
  paidBySalon: true,
};

const SEND_REMINDER: SendTextProposal = {
  kind: "send_text",
  mode: "reminder",
  clientId: "c1",
  appointmentId: "a1",
  recipientLabel: "Mary Jones",
  toNumber: "705-555-0101",
  context: "Full groom · Jul 12 · 9:00am",
  message: "Hi Mary, reminder that Kiwi is booked Saturday at 9am. See you then!",
};

const SEND_REPLY: SendTextProposal = {
  kind: "send_text",
  mode: "reply",
  smsId: "sms-1",
  recipientLabel: "Mary Jones",
  message: "Yes, 2pm Saturday works great — see you and Kiwi then!",
};

describe("describeProposal — add household", () => {
  it("names the owner, phone, and the first pet", () => {
    const text = describeProposal(ADD_HOUSEHOLD);
    expect(text).toMatch(/^Add household/);
    expect(text).toContain("Mary Jones");
    expect(text).toContain("705-555-0101");
    expect(text).toContain("Roo");
    expect(text).toContain(formatMoney(68));
  });
});

describe("describeProposal — add pet", () => {
  it("names the pet, owner, and breed/size/fee", () => {
    const text = describeProposal(ADD_PET);
    expect(text).toMatch(/^Add pet/);
    expect(text).toContain("Maple");
    expect(text).toContain("Mary Jones");
    expect(text).toContain("Poodle");
    expect(text).toContain(formatMoney(82.5));
  });
});

describe("describeProposal — edit household", () => {
  it("names the household and surfaces what changes", () => {
    const text = describeProposal(EDIT_HOUSEHOLD);
    expect(text).toMatch(/^Update /);
    expect(text).toContain("Mary Jones");
    expect(text).toContain("705-555-9999");
  });
});

describe("describeProposal — edit pet", () => {
  it("names the pet and surfaces what changes", () => {
    const text = describeProposal(EDIT_PET);
    expect(text).toMatch(/^Update /);
    expect(text).toContain("Kiwi");
    expect(text).toContain("Oatmeal shampoo only");
  });
});

describe("describeProposal — edit appointment", () => {
  it("reschedule/change names the new date, time, service, and fee", () => {
    const text = describeProposal(EDIT_APPT_CHANGE);
    expect(text).toContain("Kiwi");
    expect(text).toContain(formatDate("2026-07-12"));
    expect(text).toContain("9:00am");
    expect(text).toContain("Full groom");
    expect(text).toContain(formatMoney(80));
  });

  it("cancel clearly says the booking is being cancelled/removed", () => {
    const text = describeProposal(EDIT_APPT_CANCEL);
    expect(text.toLowerCase()).toContain("cancel");
    expect(text).toContain("Kiwi");
    expect(text).toContain(formatDate("2026-07-12"));
  });

  it("no-show says it marks a no-show and keeps the record (not a delete)", () => {
    const text = describeProposal(EDIT_APPT_NO_SHOW);
    expect(text.toLowerCase()).toContain("no-show");
    expect(text).toContain("Kiwi");
    expect(text).toContain(formatDate("2026-07-12"));
    expect(text.toLowerCase()).toContain("keep");
    expect(text.toLowerCase()).not.toContain("delete");
  });
});

describe("describeProposal — delete household", () => {
  it("says DELETE clearly, names the household, and flags it permanent", () => {
    const text = describeProposal(DELETE_HOUSEHOLD);
    expect(text).toContain("DELETE");
    expect(text).toContain("Mary Jones");
    expect(text.toLowerCase()).toContain("permanent");
  });
});

describe("describeProposal — log daily income", () => {
  it("names the day, location, and the kept amount", () => {
    const text = describeProposal(LOG_DAILY_INCOME);
    expect(text).toContain(formatDate("2026-07-12"));
    expect(text).toContain(formatMoney(240));
    expect(text.toLowerCase()).toContain("salon");
  });
});

describe("describeProposal — send text", () => {
  it("reminder shows the recipient and the FULL drafted message verbatim", () => {
    const text = describeProposal(SEND_REMINDER);
    expect(text.toLowerCase()).toContain("text");
    expect(text).toContain("Mary Jones");
    expect(text).toContain(SEND_REMINDER.message);
  });

  it("reply shows it is a reply and the FULL drafted message verbatim", () => {
    const text = describeProposal(SEND_REPLY);
    expect(text.toLowerCase()).toContain("reply");
    expect(text).toContain(SEND_REPLY.message);
  });
});
