import { unstable_noStore as noStore } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Row } from "@/lib/data/live";
import type { BookingRequestInboxRow } from "@/lib/inbox";

export async function loadRecentBookingRequests(
  limit = 20,
): Promise<BookingRequestInboxRow[]> {
  noStore();
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("booking_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []).map(mapBookingRequestRow);
  } catch {
    return [];
  }
}

function mapBookingRequestRow(row: Row): BookingRequestInboxRow {
  return {
    id: stringValue(row.id),
    client_id: nullableString(row.client_id),
    pet_id: nullableString(row.pet_id),
    requested_date: stringValue(row.requested_date),
    requested_time_slot: nullableString(row.requested_time_slot),
    preferred_location: nullableString(row.preferred_location),
    service_type: nullableString(row.service_type),
    client_message: nullableString(row.client_message),
    status: stringValue(row.status) || "pending",
    created_at: stringValue(row.created_at),
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
