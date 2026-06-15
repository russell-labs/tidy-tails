import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  describeProposal,
  type BookAppointmentProposal,
  type DeleteHouseholdProposal,
  type EditAppointmentProposal,
  type SendTextProposal,
} from "@/lib/agent/proposals";
import {
  AssistantConfirmCard,
  confirmCardShowsActions,
} from "./AssistantConfirmCard";

// The confirm card IS the safety mechanism: it must show the EXACT resolved
// action, only offer Confirm/Cancel while pending, and — once cancelled or done —
// expose no way to (re)trigger a write. We assert that statically.

const PROPOSAL: BookAppointmentProposal = {
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

const noop = () => {};

describe("AssistantConfirmCard", () => {
  it("renders the resolved action text exactly (card == action)", () => {
    const html = renderToStaticMarkup(
      <AssistantConfirmCard proposal={PROPOSAL} status="pending" onConfirm={noop} onCancel={noop} />,
    );
    expect(html).toContain(describeProposal(PROPOSAL));
  });

  it("offers Confirm and Cancel while pending", () => {
    const html = renderToStaticMarkup(
      <AssistantConfirmCard proposal={PROPOSAL} status="pending" onConfirm={noop} onCancel={noop} />,
    );
    expect(html).toContain("Confirm");
    expect(html).toContain("Cancel");
    // Nothing is saved yet — no success copy on a pending card.
    expect(html.toLowerCase()).not.toContain("saved");
  });

  it("after Cancel shows that nothing was saved and offers no action buttons", () => {
    const html = renderToStaticMarkup(
      <AssistantConfirmCard
        proposal={PROPOSAL}
        status="cancelled"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(html.toLowerCase()).toContain("nothing was saved");
    expect(html).not.toContain(">Confirm<");
  });

  it("shows the result message on a saved / gated / error card without action buttons", () => {
    for (const status of ["saved", "gated", "error"] as const) {
      const html = renderToStaticMarkup(
        <AssistantConfirmCard
          proposal={PROPOSAL}
          status={status}
          message="Booked Kiwi."
          onConfirm={noop}
          onCancel={noop}
        />,
      );
      expect(html).toContain("Booked Kiwi.");
      expect(html).not.toContain(">Confirm<");
    }
  });
});

const DELETE: DeleteHouseholdProposal = {
  kind: "delete_household",
  clientId: "c1",
  ownerName: "Rosanne Adams",
  petNames: "Kiwi",
  petCount: 1,
  appointmentCount: 0,
  hasHistory: false,
};

const CANCEL: EditAppointmentProposal = {
  kind: "edit_appointment",
  mode: "cancel",
  clientId: "c1",
  petId: "p1",
  targetDate: "2026-07-11",
  targetTimeSlot: "10:30am",
  ownerName: "Rosanne Adams",
  petName: "Kiwi",
  date: "2026-07-11",
  service: "Full groom",
};

const REPLY: SendTextProposal = {
  kind: "send_text",
  mode: "reply",
  smsId: "sms-1",
  recipientLabel: "Rosanne Adams",
  message: "Yes, 2pm works!",
};

describe("AssistantConfirmCard — Phase 4 kinds", () => {
  it("renders the exact resolved action text for a reply (the full message verbatim)", () => {
    const html = renderToStaticMarkup(
      <AssistantConfirmCard proposal={REPLY} status="pending" onConfirm={noop} onCancel={noop} />,
    );
    expect(html).toContain(describeProposal(REPLY));
    expect(html).toContain("Yes, 2pm works!");
  });

  it("a destructive DELETE card says DELETE, uses a Delete/Keep button pair, and is danger-styled", () => {
    const html = renderToStaticMarkup(
      <AssistantConfirmCard proposal={DELETE} status="pending" onConfirm={noop} onCancel={noop} />,
    );
    expect(html).toContain("DELETE"); // describeProposal makes the permanence explicit
    expect(html).toContain(">Delete<");
    expect(html).toContain(">Keep<");
    expect(html).toContain("bg-danger"); // destructive confirm button styling
  });

  it("a cancel-booking card labels the confirm 'Cancel booking' and the dismiss 'Keep'", () => {
    const html = renderToStaticMarkup(
      <AssistantConfirmCard proposal={CANCEL} status="pending" onConfirm={noop} onCancel={noop} />,
    );
    expect(html).toContain("Cancel booking");
    expect(html).toContain(">Keep<");
  });
});

describe("confirmCardShowsActions", () => {
  it("only the pending card exposes the Confirm/Cancel actions", () => {
    expect(confirmCardShowsActions("pending")).toBe(true);
    // Every terminal/in-flight status hides the actions — so once cancelled, a
    // write can never be (re)triggered, and Cancel definitively wrote nothing.
    for (const status of ["confirming", "saved", "gated", "error", "cancelled"] as const) {
      expect(confirmCardShowsActions(status)).toBe(false);
    }
  });
});
