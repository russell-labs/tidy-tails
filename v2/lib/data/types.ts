// Core domain types for Tidy Tails v2.
// Field names mirror the live Supabase schema plus the v2 schema additions
// documented in _reports/2026-05-15-v2-design-lock-spec.md §6, so the data
// layer can swap fixtures for a live read with no UI rework.

export type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  alt_contact: string | null;
  email: string | null; // v2 schema addition — null on live reads
  address: string | null; // live `clients` column; captured by the intake flow
  notes: string | null;
  created_at: string;
};

export type Sex = "M" | "F";

export type Pet = {
  id: string;
  client_id: string;
  name: string;
  breed: string | null;
  size?: string | null;
  color: string | null; // v2 schema addition — null on live reads
  age?: string | null; // live v1 free-text age; ISO birth dates age over time
  sex: Sex | null; // v2 schema addition — null on live reads
  date_of_birth: string | null; // v2 schema addition — null on live reads
  allergies: boolean;
  allergies_detail: string | null;
  grooming_notes: string | null;
  typical_fee: number | null; // v2 schema addition — null on live reads
  created_at: string;
};

export type Appointment = {
  id: string;
  client_id: string;
  pet_id: string;
  date: string; // ISO date (YYYY-MM-DD)
  time_slot: string | null; // free-text appointment time, when recorded
  service: string | null; // null when the live row has no service_type (e.g. backfills)
  price: number | null; // null when the live row has no fee recorded
  tip: number | null; // null when the row has no tip recorded
  notes: string | null;
  status?: string | null;
  location?: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  google_sync_status: string | null;
  google_sync_error: string | null;
  google_synced_at: string | null;
  created_at: string;
};

export type Vaccination = {
  id: string;
  pet_id: string;
  vaccine_type: string;
  expires_at: string; // ISO date (YYYY-MM-DD)
  notes: string | null;
};

// Convenience shape: a client with their pets and appointment history attached.
export type ClientRecord = {
  client: Client;
  pets: Pet[];
  appointments: Appointment[];
};
