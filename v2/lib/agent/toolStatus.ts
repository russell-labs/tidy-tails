// Agentic layer — live status labels.
//
// Maps a read tool's name to a short, friendly phrase the UI shows while that
// tool is running ("Looking up your schedule…"), so the assistant visibly shows
// what it is doing. Pure and client-safe (no server imports) — the streaming UI
// imports it directly. An unknown tool falls back to a generic phrase so a new
// tool never shows a blank status.

const TOOL_STATUS: Record<string, string> = {
  get_schedule: "Looking up your schedule…",
  find_household: "Searching your clients…",
  get_pet_history: "Pulling up the pet's history…",
  get_groom_detail: "Checking your groom notes…",
  get_day_income: "Adding up the day…",
  list_lapsed_clients: "Finding clients due for a rebook…",
  get_locations: "Checking your locations…",
};

/** A friendly "what the assistant is doing" phrase for a tool, with a safe default. */
export function toolStatusLabel(toolName: string): string {
  return TOOL_STATUS[toolName] ?? "Looking that up…";
}
