"use client";

import Link from "next/link";

export function SchedulePetProfileLink({
  clientId,
  petId,
  petName,
}: {
  clientId: string;
  petId: string;
  petName: string;
}) {
  return (
    <Link
      href={`/clients/${clientId}/pets/${petId}`}
      onClick={(event) => event.stopPropagation()}
      className="text-brand underline decoration-brand/30 underline-offset-2"
    >
      {petName}
    </Link>
  );
}
