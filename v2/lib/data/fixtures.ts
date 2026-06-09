// Anonymized seed data for the Ship 2.1 read-only scaffold.
//
// SAFETY: every record here is fully SYNTHETIC. No real Tidy Tails customer,
// pet, phone number, or appointment appears in this file. Phone numbers use the
// 555 fictional exchange. This is the default data source — no live connection.
//
// Dates are generated relative to "now" so lapsed-client and vaccination
// demonstrations stay accurate whenever the app is run.

import type { Appointment, Client, Pet, Vaccination } from "./types";
import type { OwnedLocation } from "../orgSettings";
import type { SmsMessage } from "../inboundSms";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Seeds omit the WS0 consent columns; FIXTURE_CLIENTS below defaults them to
// not-consented. A couple of seeds opt in (sms_consent: true) so the consented
// booking-text path is demoable and testable alongside the gated default.
type FixtureClientSeed = Omit<Client, "sms_consent" | "sms_consent_at"> &
  Partial<Pick<Client, "sms_consent" | "sms_consent_at">>;

const FIXTURE_CLIENT_SEEDS: FixtureClientSeed[] = [
  { id: "c01", first_name: "Felix", last_name: "Aaronson", phone: "705-555-0106", alt_contact: null, email: "felix.a@example.com", address: "14 Birchwood Lane", notes: null, created_at: isoDaysAgo(620) },
  { id: "c02", first_name: "Maya", last_name: "Albright", phone: "705-555-0118", alt_contact: "Partner: 705-555-0119", email: "maya.albright@example.com", address: "208 Lakeshore Rd", notes: "Prefers morning slots.", created_at: isoDaysAgo(540) },
  { id: "c03", first_name: "Theo", last_name: "Brandt", phone: "705-555-0147", alt_contact: null, email: null, address: null, notes: "Two dogs — usually booked together.", created_at: isoDaysAgo(710) },
  { id: "c04", first_name: "Priya", last_name: "Castellano", phone: "705-555-0163", alt_contact: null, email: "priya.c@example.com", address: null, notes: null, created_at: isoDaysAgo(395) },
  { id: "c05", first_name: "Marcus", last_name: "Delaney", phone: "705-555-0172", alt_contact: null, email: null, address: null, notes: "Pays by e-transfer.", created_at: isoDaysAgo(480) },
  { id: "c06", first_name: "Jonah", last_name: "Ellsworth", phone: "705-555-0168", alt_contact: null, email: "jonah.e@example.com", address: null, notes: null, created_at: isoDaysAgo(300) },
  { id: "c07", first_name: "Wren", last_name: "Halloway", phone: "705-555-0102", alt_contact: null, email: "wren.h@example.com", address: null, notes: "Show dog — frequent visits.", created_at: isoDaysAgo(640) },
  { id: "c08", first_name: "Garrett", last_name: "Hsu", phone: "705-555-0190", alt_contact: "Work: 705-555-0191", email: null, address: null, notes: null, created_at: isoDaysAgo(560) },
  { id: "c09", first_name: "Otis", last_name: "Lindqvist", phone: "705-555-0131", alt_contact: null, email: null, address: null, notes: "Big dog — needs the extra time slot.", created_at: isoDaysAgo(420) },
  { id: "c10", first_name: "Sofia", last_name: "Marchetti", phone: "705-555-0113", alt_contact: null, email: "sofia.m@example.com", address: null, notes: null, created_at: isoDaysAgo(260) },
  { id: "c11", first_name: "Desmond", last_name: "Ng", phone: "705-555-0109", alt_contact: null, email: "desmond.ng@example.com", address: null, notes: null, created_at: isoDaysAgo(350) },
  { id: "c12", first_name: "Hannah", last_name: "Ortega", phone: "705-555-0184", alt_contact: null, email: null, address: null, notes: "Reminder texts appreciated.", sms_consent: true, sms_consent_at: isoDaysAgo(120), created_at: isoDaysAgo(510) },
  { id: "c13", first_name: "Aileen", last_name: "Park", phone: "705-555-0125", alt_contact: null, email: "aileen.park@example.com", address: "57 Cedar Crescent", notes: null, created_at: isoDaysAgo(330) },
  { id: "c14", first_name: "Dale", last_name: "Pemberton", phone: "705-555-0157", alt_contact: null, email: null, address: null, notes: "Has not booked in a while — follow up.", created_at: isoDaysAgo(600) },
  { id: "c15", first_name: "Camila", last_name: "Reyes", phone: "705-555-0179", alt_contact: "Partner: 705-555-0180", email: "camila.r@example.com", address: null, notes: "Two huskies, heavy de-shed.", sms_consent: true, sms_consent_at: isoDaysAgo(80), created_at: isoDaysAgo(470) },
  { id: "c16", first_name: "Greta", last_name: "Sandoval", phone: "705-555-0188", alt_contact: null, email: null, address: null, notes: null, created_at: isoDaysAgo(210) },
  { id: "c17", first_name: "Bonnie", last_name: "Tran", phone: "705-555-0144", alt_contact: null, email: "bonnie.tran@example.com", address: null, notes: null, created_at: isoDaysAgo(290) },
  { id: "c18", first_name: "Russ", last_name: "Vandermeer", phone: "705-555-0120", alt_contact: null, email: "russ.v@example.com", address: null, notes: null, created_at: isoDaysAgo(380) },
  { id: "c19", first_name: "Renata", last_name: "Voss", phone: "705-555-0136", alt_contact: null, email: null, address: null, notes: "Two poodles.", created_at: isoDaysAgo(660) },
  { id: "c20", first_name: "Caleb", last_name: "Whitmore", phone: "705-555-0151", alt_contact: null, email: "caleb.w@example.com", address: null, notes: null, created_at: isoDaysAgo(580) },
  // Marisol Park shares a surname with Aileen Park (c13) — owner-name
  // disambiguation. Her Bella and Glen Okafor's Bella share a pet name —
  // common-pet-name disambiguation (PRD §1.1).
  { id: "c21", first_name: "Marisol", last_name: "Park", phone: "705-555-0133", alt_contact: null, email: "marisol.p@example.com", address: "33 Maplewood Dr", notes: null, created_at: isoDaysAgo(440) },
  { id: "c22", first_name: "Glen", last_name: "Okafor", phone: "705-555-0155", alt_contact: null, email: null, address: "9 Pinegrove Ave", notes: "Two dogs — Bella usually books with Rufus.", created_at: isoDaysAgo(520) },
];

export const FIXTURE_CLIENTS: Client[] = FIXTURE_CLIENT_SEEDS.map((seed) => ({
  sms_consent: false,
  sms_consent_at: null,
  ...seed,
}));

export const FIXTURE_PETS: Pet[] = [
  { id: "p01", client_id: "c01", name: "Waldo", breed: "Dachshund", color: "Black & tan", sex: "M", date_of_birth: isoDaysAgo(1500), allergies: false, allergies_detail: null, grooming_notes: "Sensitive about back paws — go slow on rear nails.", typical_fee: 58, created_at: isoDaysAgo(620) },
  { id: "p02", client_id: "c02", name: "Biscuit", breed: "Goldendoodle", color: "Apricot", sex: "M", date_of_birth: isoDaysAgo(1100), allergies: false, allergies_detail: null, grooming_notes: "Matts behind the ears — check every visit.", typical_fee: 95, created_at: isoDaysAgo(540) },
  { id: "p03", client_id: "c03", name: "Pepper", breed: "Miniature Schnauzer", color: "Salt & pepper", sex: "F", date_of_birth: isoDaysAgo(2100), allergies: false, allergies_detail: null, grooming_notes: "Standard schnauzer cut. Tidy beard.", typical_fee: 72, created_at: isoDaysAgo(710) },
  { id: "p04", client_id: "c03", name: "Olive", breed: "Cockapoo", color: "Chocolate", sex: "F", date_of_birth: isoDaysAgo(900), allergies: true, allergies_detail: "Reacts to oatmeal shampoo — use the hypoallergenic line only.", grooming_notes: "Nervous with the dryer; towel-dry where possible.", typical_fee: 78, created_at: isoDaysAgo(710) },
  { id: "p05", client_id: "c04", name: "Mango", breed: "Shih Tzu", color: "Gold & white", sex: "M", date_of_birth: isoDaysAgo(1800), allergies: true, allergies_detail: "Severe flea-treatment allergy. Do NOT apply any flea or tick product. Owner handles separately with their vet.", grooming_notes: "Eye area needs frequent trimming. Keep face short.", typical_fee: 65, created_at: isoDaysAgo(395) },
  { id: "p06", client_id: "c05", name: "Roscoe", breed: "English Bulldog", color: "Brindle", sex: "M", date_of_birth: isoDaysAgo(1300), allergies: true, allergies_detail: "Skin-fold dermatitis — avoid fragranced products. Pat skin folds fully dry.", grooming_notes: "Snores; gets warm quickly. Keep sessions short.", typical_fee: 70, created_at: isoDaysAgo(480) },
  { id: "p07", client_id: "c06", name: "Tank", breed: "Boxer", color: "Fawn", sex: "M", date_of_birth: isoDaysAgo(1600), allergies: false, allergies_detail: null, grooming_notes: "High energy — needs a firm but calm hand.", typical_fee: 68, created_at: isoDaysAgo(300) },
  { id: "p08", client_id: "c07", name: "Marshmallow", breed: "Samoyed", color: "White", sex: "F", date_of_birth: isoDaysAgo(1200), allergies: false, allergies_detail: null, grooming_notes: "Full de-shed and blow-out. Never shave the double coat.", typical_fee: 125, created_at: isoDaysAgo(640) },
  { id: "p09", client_id: "c08", name: "Bear", breed: "Bernese Mountain Dog", color: "Tricolour", sex: "M", date_of_birth: isoDaysAgo(2000), allergies: false, allergies_detail: null, grooming_notes: "Large breed — book the long slot. Heavy undercoat.", typical_fee: 130, created_at: isoDaysAgo(560) },
  { id: "p10", client_id: "c09", name: "Moose", breed: "Newfoundland", color: "Black", sex: "M", date_of_birth: isoDaysAgo(1700), allergies: true, allergies_detail: "Contact allergy to harsh degreasers. Use the gentle shampoo only.", grooming_notes: "Very large. Drools. Two-person lift onto the table.", typical_fee: 135, created_at: isoDaysAgo(420) },
  { id: "p11", client_id: "c10", name: "Pixel", breed: "Yorkshire Terrier", color: "Steel & tan", sex: "F", date_of_birth: isoDaysAgo(1000), allergies: false, allergies_detail: null, grooming_notes: "Keep a short puppy cut. Topknot optional.", typical_fee: 60, created_at: isoDaysAgo(260) },
  { id: "p12", client_id: "c11", name: "Cooper", breed: "Labrador Retriever", color: "Yellow", sex: "M", date_of_birth: isoDaysAgo(1400), allergies: false, allergies_detail: null, grooming_notes: "Easy-going. Standard bath and de-shed.", typical_fee: 70, created_at: isoDaysAgo(350) },
  { id: "p13", client_id: "c12", name: "Waffles", breed: "Bichon Frise", color: "White", sex: "M", date_of_birth: isoDaysAgo(1150), allergies: false, allergies_detail: null, grooming_notes: "Classic round bichon trim. Tear-stain wipe.", typical_fee: 74, created_at: isoDaysAgo(510) },
  { id: "p14", client_id: "c13", name: "Nori", breed: "Pomeranian", color: "Orange sable", sex: "F", date_of_birth: isoDaysAgo(850), allergies: false, allergies_detail: null, grooming_notes: "Teddy-bear face trim. Never shave down.", typical_fee: 64, created_at: isoDaysAgo(330) },
  { id: "p15", client_id: "c14", name: "Gus", breed: "Beagle", color: "Tricolour", sex: "M", date_of_birth: isoDaysAgo(2400), allergies: true, allergies_detail: "Itchy with scented sprays — finish with no cologne or spritz.", grooming_notes: "Senior dog. Arthritic hips — keep table time gentle and short.", typical_fee: 56, created_at: isoDaysAgo(600) },
  { id: "p16", client_id: "c15", name: "Luna", breed: "Siberian Husky", color: "Black & white", sex: "F", date_of_birth: isoDaysAgo(1250), allergies: false, allergies_detail: null, grooming_notes: "Heavy seasonal blow-out. Never shave.", typical_fee: 98, created_at: isoDaysAgo(470) },
  { id: "p17", client_id: "c15", name: "Sol", breed: "Siberian Husky", color: "Red & white", sex: "M", date_of_birth: isoDaysAgo(980), allergies: false, allergies_detail: null, grooming_notes: "Litter-mate energy with Luna — groom one at a time.", typical_fee: 98, created_at: isoDaysAgo(470) },
  { id: "p18", client_id: "c16", name: "Peanut", breed: "Chihuahua", color: "Tan", sex: "F", date_of_birth: isoDaysAgo(700), allergies: false, allergies_detail: null, grooming_notes: "Tiny. Quick bath and nails. Dislikes the dryer noise.", typical_fee: 48, created_at: isoDaysAgo(210) },
  { id: "p19", client_id: "c17", name: "Cricket", breed: "Maltese", color: "White", sex: "F", date_of_birth: isoDaysAgo(1050), allergies: false, allergies_detail: null, grooming_notes: "Long-coat owner — keep length, just clean up.", typical_fee: 66, created_at: isoDaysAgo(290) },
  { id: "p20", client_id: "c18", name: "Kiwi", breed: "Cavapoo", color: "Apricot & white", sex: "F", date_of_birth: isoDaysAgo(760), allergies: false, allergies_detail: null, grooming_notes: "Soft wavy coat. Light trim, keep it fluffy.", typical_fee: 76, created_at: isoDaysAgo(380) },
  { id: "p21", client_id: "c19", name: "Clementine", breed: "Standard Poodle", color: "Cream", sex: "F", date_of_birth: isoDaysAgo(1900), allergies: false, allergies_detail: null, grooming_notes: "Continental-adjacent pet trim. Owner is particular about topknot.", typical_fee: 110, created_at: isoDaysAgo(660) },
  { id: "p22", client_id: "c19", name: "Soda", breed: "Miniature Poodle", color: "Silver", sex: "M", date_of_birth: isoDaysAgo(1450), allergies: false, allergies_detail: null, grooming_notes: "Short sporting clip. Easy.", typical_fee: 82, created_at: isoDaysAgo(660) },
  { id: "p23", client_id: "c20", name: "Duke", breed: "German Shepherd", color: "Black & tan", sex: "M", date_of_birth: isoDaysAgo(2200), allergies: false, allergies_detail: null, grooming_notes: "De-shed and bath. Wary of strangers — let him settle first.", typical_fee: 92, created_at: isoDaysAgo(580) },
  // Two dogs named "Bella" in different households — different breeds, and one
  // has an allergy — so the search cards visibly disambiguate which Bella.
  { id: "p24", client_id: "c21", name: "Bella", breed: "Havanese", color: "Cream", sex: "F", date_of_birth: isoDaysAgo(1020), allergies: false, allergies_detail: null, grooming_notes: "Soft full coat — scissor finish, keep the length.", typical_fee: 80, created_at: isoDaysAgo(440) },
  { id: "p25", client_id: "c22", name: "Bella", breed: "Pomeranian", color: "Orange sable", sex: "F", date_of_birth: isoDaysAgo(1320), allergies: true, allergies_detail: "Reacts to scented shampoo — hypoallergenic line only, no finishing spritz.", grooming_notes: "Teddy-bear face trim. Never shave down.", typical_fee: 66, created_at: isoDaysAgo(520) },
  { id: "p26", client_id: "c22", name: "Rufus", breed: "Bullmastiff", color: "Fawn", sex: "M", date_of_birth: isoDaysAgo(1750), allergies: false, allergies_detail: null, grooming_notes: "Large breed — book the long slot. Bath and de-shed.", typical_fee: 105, created_at: isoDaysAgo(520) },
];

const SERVICES = [
  "Full groom — bath, haircut, nails",
  "Bath & tidy",
  "Bath, blow-out, nails",
  "Full groom + de-shed",
  "Nail trim & ear clean",
];

// [petId, visits, lastVisitDaysAgo, intervalDays] — basePrice comes from the pet.
const HISTORY: Array<[string, number, number, number]> = [
  ["p01", 7, 12, 49],
  ["p02", 9, 6, 42],
  ["p03", 8, 21, 56],
  ["p04", 8, 21, 56],
  ["p05", 6, 9, 63],
  ["p06", 7, 34, 56],
  ["p07", 5, 18, 70],
  ["p08", 12, 4, 28],
  ["p09", 6, 158, 56], // Garrett Hsu — lapsed
  ["p10", 5, 27, 70],
  ["p11", 6, 14, 49],
  ["p12", 7, 40, 63],
  ["p13", 8, 8, 49],
  ["p14", 6, 31, 56],
  ["p15", 5, 184, 70], // Dale Pemberton — lapsed
  ["p16", 6, 19, 63],
  ["p17", 6, 19, 63],
  ["p18", 4, 25, 70],
  ["p19", 7, 11, 49],
  ["p20", 6, 46, 63],
  ["p21", 9, 7, 42],
  ["p22", 9, 7, 42],
  ["p23", 5, 137, 63], // Caleb Whitmore — lapsed
  ["p24", 5, 16, 49], // Marisol Park's Bella
  ["p25", 6, 23, 56], // Glen Okafor's Bella
  ["p26", 4, 30, 70], // Glen Okafor's Rufus
];

function buildAppointments(): Appointment[] {
  const out: Appointment[] = [];
  for (const [petId, visits, lastVisitDaysAgo, intervalDays] of HISTORY) {
    const pet = FIXTURE_PETS.find((p) => p.id === petId)!;
    const base = pet.typical_fee ?? 70;
    for (let i = 0; i < visits; i++) {
      const dayOffset = lastVisitDaysAgo + i * intervalDays;
      const date = isoDaysAgo(dayOffset);
      out.push({
        id: `${petId}-a${String(i).padStart(2, "0")}`,
        client_id: pet.client_id,
        pet_id: petId,
        date,
        time_slot: null,
        service: SERVICES[i % SERVICES.length],
        price: base + ((i % 3) - 1) * 5,
        tip: i % 4 === 0 ? 10 : null,
        notes: i === 0 && pet.allergies ? "Used hypoallergenic products only." : null,
        google_calendar_id: null,
        google_event_id: null,
        google_sync_status: null,
        google_sync_error: null,
        google_synced_at: null,
        created_at: date,
      });
    }
  }
  const pepper = FIXTURE_PETS.find((p) => p.id === "p03")!;
  const olive = FIXTURE_PETS.find((p) => p.id === "p04")!;
  out.push(
    {
      id: "qa-booked-pepper",
      client_id: pepper.client_id,
      pet_id: pepper.id,
      date: isoDaysAgo(-1),
      time_slot: "10:00am",
      service: "Full groom",
      price: pepper.typical_fee,
      tip: null,
      notes: "Local QA booking for the schedule action page.",
      status: "booked",
      location: "gina",
      google_calendar_id: null,
      google_event_id: null,
      google_sync_status: null,
      google_sync_error: null,
      google_synced_at: null,
      created_at: isoDaysAgo(0),
    },
    {
      id: "qa-booked-olive",
      client_id: olive.client_id,
      pet_id: olive.id,
      date: isoDaysAgo(-1),
      time_slot: "10:00am",
      service: "Puppy groom",
      price: olive.typical_fee,
      tip: null,
      notes: "Local QA booking paired with Pepper to test grouped reminders.",
      status: "booked",
      location: "gina",
      google_calendar_id: null,
      google_event_id: null,
      google_sync_status: null,
      google_sync_error: null,
      google_synced_at: null,
      created_at: isoDaysAgo(0),
    },
  );
  return out;
}

export const FIXTURE_APPOINTMENTS: Appointment[] = buildAppointments();

function isoDaysFromNow(n: number): string {
  return isoDaysAgo(-n);
}

export const FIXTURE_VACCINATIONS: Vaccination[] = [
  { id: "v01", pet_id: "p02", vaccine_type: "Rabies", expires_at: isoDaysFromNow(410), notes: null },
  { id: "v02", pet_id: "p02", vaccine_type: "Bordetella", expires_at: isoDaysFromNow(120), notes: null },
  { id: "v03", pet_id: "p05", vaccine_type: "Rabies", expires_at: isoDaysFromNow(18), notes: "Owner reminded at last visit." },
  { id: "v04", pet_id: "p05", vaccine_type: "DHPP", expires_at: isoDaysFromNow(220), notes: null },
  { id: "v05", pet_id: "p08", vaccine_type: "Rabies", expires_at: isoDaysFromNow(300), notes: null },
  { id: "v06", pet_id: "p08", vaccine_type: "Bordetella", expires_at: isoDaysFromNow(11), notes: "Show season — keep current." },
  { id: "v07", pet_id: "p09", vaccine_type: "Bordetella", expires_at: isoDaysAgo(26), notes: "Expired — flagged for follow-up." },
  { id: "v08", pet_id: "p09", vaccine_type: "Rabies", expires_at: isoDaysFromNow(95), notes: null },
  { id: "v09", pet_id: "p15", vaccine_type: "Rabies", expires_at: isoDaysAgo(54), notes: "Expired — owner not seen recently." },
  { id: "v10", pet_id: "p16", vaccine_type: "Rabies", expires_at: isoDaysFromNow(500), notes: null },
  { id: "v11", pet_id: "p16", vaccine_type: "DHPP", expires_at: isoDaysFromNow(24), notes: null },
  { id: "v12", pet_id: "p23", vaccine_type: "Rabies", expires_at: isoDaysFromNow(60), notes: null },
];

export const FIXTURE_SMS_MESSAGES: SmsMessage[] = [
  {
    id: "fixture-sms-inbound-question",
    groomer_id: "fixture-groomer",
    client_id: "c03",
    direction: "inbound",
    from_phone: "705-555-0147",
    to_phone: "705-555-0000",
    body: "What time should I bring Pepper and Olive tomorrow?",
    twilio_message_sid: "SMFIXTUREINBOUND1",
    status: "received",
    match_status: "matched",
    received_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    sent_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
  {
    id: "fixture-sms-outbound-delivered",
    groomer_id: "fixture-groomer",
    client_id: "c03",
    direction: "outbound",
    from_phone: "705-555-0000",
    to_phone: "705-555-0147",
    body: "They are booked for 10:00am at 60 Olive Crescent.",
    twilio_message_sid: "SMFIXTUREDELIVERED1",
    status: "delivered",
    match_status: "matched",
    received_at: null,
    sent_at: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
  },
  {
    id: "fixture-sms-outbound-failed",
    groomer_id: "fixture-groomer",
    client_id: "c03",
    direction: "outbound",
    from_phone: "705-555-0000",
    to_phone: "705-555-0147",
    body: "This fixture proves failed delivery is visible before production checks.",
    twilio_message_sid: "SMFIXTUREFAILED1",
    status: "failed",
    match_status: "matched",
    received_at: null,
    sent_at: new Date(Date.now() - 1000 * 60 * 26).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 26).toISOString(),
  },
];

// WS4b — a standalone owner-operator (own-facility) fixture for exercising the
// take-home reports + Owner Economics export. Deliberately NOT merged into
// FIXTURE_APPOINTMENTS (which feeds Sam's batched demo) — owner appointments
// carry a free-text owned-location name, not gina/annette, and must not pollute
// Sam's data. Dates are fixed so the monthly take-home math is deterministic.
export const FIXTURE_OWNER_MONTH = {
  from: "2026-05-01",
  to: "2026-05-31",
} as const;

export const FIXTURE_OWNED_LOCATION: OwnedLocation = {
  name: "Cheryl's Shop",
  address: "5 Maple Street, Orillia",
  expenses: {
    rentMortgage: 1200,
    utilities: 150,
    supplies: 80,
    upkeep: 20,
    cleaning: 50,
  },
};

function ownerAppt(
  id: string,
  date: string,
  price: number,
  tip: number | null,
  notes: string | null = null,
): Appointment {
  return {
    id,
    client_id: `owner-c-${id}`,
    pet_id: `owner-p-${id}`,
    date,
    time_slot: "10:00am",
    duration_minutes: 90,
    service: "Full groom",
    price,
    tip,
    notes,
    status: "booked",
    location: FIXTURE_OWNED_LOCATION.name,
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-05-01T00:00:00.000Z",
  };
}

// May 2026 at Cheryl's Shop: three collected visits (with tips) and one waiting
// on payment (excluded from collected). Fees 280, tips 25, collected 305.
export const FIXTURE_OWNER_APPOINTMENTS: Appointment[] = [
  ownerAppt("o1", "2026-05-04", 90, 10),
  ownerAppt("o2", "2026-05-12", 120, 0),
  ownerAppt("o3", "2026-05-20", 70, 15),
  ownerAppt("o4", "2026-05-26", 100, 20, "[payment:cash; payment_status:waiting]"),
];
