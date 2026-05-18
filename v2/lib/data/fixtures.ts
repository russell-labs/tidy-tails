// Anonymized seed data for the Ship 2.1 read-only scaffold.
//
// SAFETY: every record here is fully SYNTHETIC. No real Tidy Tails customer,
// pet, phone number, or appointment appears in this file. Phone numbers use the
// 555 fictional exchange. This is the default data source — no live connection.
//
// Dates are generated relative to "now" so lapsed-client and vaccination
// demonstrations stay accurate whenever the app is run.

import type { Appointment, Client, Pet, Vaccination } from "./types";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const FIXTURE_CLIENTS: Client[] = [
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
  { id: "c12", first_name: "Hannah", last_name: "Ortega", phone: "705-555-0184", alt_contact: null, email: null, address: null, notes: "Reminder texts appreciated.", created_at: isoDaysAgo(510) },
  { id: "c13", first_name: "Aileen", last_name: "Park", phone: "705-555-0125", alt_contact: null, email: "aileen.park@example.com", address: "57 Cedar Crescent", notes: null, created_at: isoDaysAgo(330) },
  { id: "c14", first_name: "Dale", last_name: "Pemberton", phone: "705-555-0157", alt_contact: null, email: null, address: null, notes: "Has not booked in a while — follow up.", created_at: isoDaysAgo(600) },
  { id: "c15", first_name: "Camila", last_name: "Reyes", phone: "705-555-0179", alt_contact: "Partner: 705-555-0180", email: "camila.r@example.com", address: null, notes: "Two huskies, heavy de-shed.", created_at: isoDaysAgo(470) },
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
        service: SERVICES[i % SERVICES.length],
        price: base + ((i % 3) - 1) * 5,
        tip: i % 4 === 0 ? 10 : null,
        notes: i === 0 && pet.allergies ? "Used hypoallergenic products only." : null,
        created_at: date,
      });
    }
  }
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
