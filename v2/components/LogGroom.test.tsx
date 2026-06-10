import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Client, Pet } from "@/lib/data/types";
import { GroomForm } from "./LogGroom";

// The live form is reached through the Sheet (a portal that only mounts when
// open), so these tests render GroomForm directly and assert the static markup.

const client: Client = {
  id: "c1",
  first_name: "Mary",
  last_name: "Anca",
  phone: "705-330-1807",
  alt_contact: null,
  email: null,
  address: null,
  notes: null,
  sms_consent: false,
  sms_consent_at: null,
  created_at: "2026-01-01",
};

function pet(id: string, name: string, typicalFee: number | null): Pet {
  return {
    id,
    client_id: "c1",
    name,
    breed: null,
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: typicalFee,
    created_at: "2026-01-01",
  };
}

const sadie = pet("p1", "Sadie", 60);
const ruby = pet("p2", "Ruby", 45);

function render(pets: Pet[]) {
  return renderToStaticMarkup(
    <GroomForm
      client={client}
      pets={pets}
      appointments={[]}
      mode="fixtures"
      writesEnabled={false}
      onDone={() => {}}
    />,
  );
}

describe("LogGroom form for a same-household booking", () => {
  it("shows a dropdown of the booked dogs and defaults to the first (the appointment's pet)", () => {
    const html = render([sadie, ruby]);

    // Both booked dogs are selectable from the pet dropdown.
    expect(html).toContain(">Sadie</option>");
    expect(html).toContain(">Ruby</option>");
    // The groom is submitted for the appointment's pet (passed first) by default.
    expect(html).toContain('name="pet_id" value="p1"');
    // And its own fee default is prefilled from that dog, not the sibling's.
    expect(html).toContain('name="fee" value="60"');
  });

  it("derives the fee default from the leading dog's own history, not a sibling's", () => {
    // The page puts the appointment's dog first, so pets[0] drives groomDefaults.
    // This proves the default is genuinely per-pet; the open-dropdown-and-pick
    // interaction (onPetChange) is exercised at the e2e layer, not here.
    const html = render([ruby, sadie]);

    expect(html).toContain('name="pet_id" value="p2"');
    expect(html).toContain('name="fee" value="45"');
  });

  it("renders no dropdown for a single-dog booking", () => {
    const html = render([sadie]);

    // Single dog: a static label, not a pet <option>.
    expect(html).not.toContain(">Sadie</option>");
    expect(html).toContain("Pet:");
    expect(html).toContain('name="pet_id" value="p1"');
  });
});
