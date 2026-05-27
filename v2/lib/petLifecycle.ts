import type { Appointment, Pet } from "./data/types";
import type { PetSize } from "./intake";

export const PASSED_AWAY_MARKER = "[Tidy Tails: passed away]";

export function isPetPassedAway(pet: Pick<Pet, "grooming_notes">): boolean {
  return (pet.grooming_notes ?? "").includes(PASSED_AWAY_MARKER);
}

export function activePets<T extends Pick<Pet, "grooming_notes">>(
  pets: T[],
): T[] {
  return pets.filter((pet) => !isPetPassedAway(pet));
}

export function buildPassedAwayGroomingNotes(
  currentNotes: string | null | undefined,
): string {
  const notes = (currentNotes ?? "").trim();
  if (notes.includes(PASSED_AWAY_MARKER)) return notes;
  return notes ? `${PASSED_AWAY_MARKER}\n\n${notes}` : PASSED_AWAY_MARKER;
}

export function canDeletePetProfile({
  petId,
  appointments,
}: {
  petId: string;
  appointments: Appointment[];
}): boolean {
  return !appointments.some((appointment) => appointment.pet_id === petId);
}

export type MergeDuplicatePetUpdate = {
  name: string;
  breed: string | null;
  size: PetSize | null;
  color: string | null;
  age: string | null;
  allergies: boolean;
  allergies_detail: string | null;
  grooming_notes: string | null;
  standard_fee: number | null;
};

export type MergeDuplicatePetPlan =
  | {
      ok: true;
      keeperPetUpdate: MergeDuplicatePetUpdate;
      appointmentIdsToMove: string[];
    }
  | { ok: false; error: string };

function firstText(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return (primary ?? "").trim() || (fallback ?? "").trim() || null;
}

function combineUniqueText(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const parts = [primary, fallback]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return [...new Set(parts)].join("\n\n");
}

function mergedGroomingNotes(keep: Pet, duplicate: Pet): string | null {
  const keepNotes = (keep.grooming_notes ?? "").trim();
  const duplicateNotes = (duplicate.grooming_notes ?? "").trim();
  if (!duplicateNotes || duplicateNotes === keepNotes) return keepNotes || null;

  const mergeNote = `[Tidy Tails: Merged duplicate profile ${duplicate.id}]`;
  const duplicateBlock = `${mergeNote}\n${duplicateNotes}`;
  return keepNotes ? `${keepNotes}\n\n${duplicateBlock}` : duplicateBlock;
}

export function buildMergeDuplicatePetPlan({
  keep,
  duplicate,
  appointments,
}: {
  keep: Pet;
  duplicate: Pet;
  appointments: Appointment[];
}): MergeDuplicatePetPlan {
  if (keep.id === duplicate.id) {
    return { ok: false, error: "Choose two different pet profiles." };
  }

  return {
    ok: true,
    keeperPetUpdate: {
      name: keep.name,
      breed: firstText(keep.breed, duplicate.breed),
      size: (keep.size ?? duplicate.size ?? null) as PetSize | null,
      color: firstText(keep.color, duplicate.color),
      age: firstText(keep.date_of_birth ?? keep.age, duplicate.date_of_birth ?? duplicate.age),
      allergies: keep.allergies || duplicate.allergies,
      allergies_detail: combineUniqueText(
        keep.allergies_detail,
        duplicate.allergies_detail,
      ),
      grooming_notes: mergedGroomingNotes(keep, duplicate),
      standard_fee: keep.typical_fee ?? duplicate.typical_fee,
    },
    appointmentIdsToMove: appointments
      .filter((appointment) => appointment.pet_id === duplicate.id)
      .map((appointment) => appointment.id),
  };
}
