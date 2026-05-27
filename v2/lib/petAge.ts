const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && value === parsed.toISOString().slice(0, 10);
}

export function parseStoredPetBirthDate(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  const withoutMarker = raw.replace(/^DOB:/i, "").trim();
  return validISODate(withoutMarker) ? withoutMarker : null;
}

export function formatPetAge(
  birthDate: string | null | undefined,
  today: Date = new Date(),
): string | null {
  const iso = parseStoredPetBirthDate(birthDate);
  if (!iso) return null;

  const birth = new Date(`${iso}T12:00:00`);
  const current = new Date(today);
  if (birth > current) return null;

  let years = current.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(
    current.getFullYear(),
    birth.getMonth(),
    birth.getDate(),
    12,
  );
  if (current < birthdayThisYear) years -= 1;

  if (years >= 1) return `${years} year${years === 1 ? "" : "s"} old`;

  let months =
    (current.getFullYear() - birth.getFullYear()) * 12 +
    current.getMonth() -
    birth.getMonth();
  if (current.getDate() < birth.getDate()) months -= 1;
  months = Math.max(0, months);
  return `${months} month${months === 1 ? "" : "s"} old`;
}
