import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AllergyAlert } from "@/components/AllergyAlert";
import { AppointmentHistory } from "@/components/AppointmentHistory";
import { BackLink } from "@/components/BackLink";
import { EditPet } from "@/components/EditPet";
import { VaccinationList } from "@/components/VaccinationList";
import { dataMode, loadDataset } from "@/lib/data/repo";
import { lastKnownPrice, matchingPetRows } from "@/lib/derive";
import { formatDate, formatMoney, fullName } from "@/lib/format";
import { isEditPetWriteEnabled } from "@/lib/writeGate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ petId: string }>;
}): Promise<Metadata> {
  const { petId } = await params;
  const { pets } = await loadDataset();
  return { title: pets.find((p) => p.id === petId)?.name ?? "Pet" };
}

function describe(breed: string | null, sex: string | null, color: string | null): string {
  const parts = [
    breed,
    sex === "M" ? "Male" : sex === "F" ? "Female" : null,
    color,
  ];
  return parts.filter(Boolean).join(" · ") || "Details not recorded";
}

export default async function PetDetailPage({
  params,
}: {
  params: Promise<{ id: string; petId: string }>;
}) {
  const { id, petId } = await params;
  const { clients, pets, appointments, vaccinations } = await loadDataset();

  const pet = pets.find((p) => p.id === petId && p.client_id === id);
  const client = clients.find((c) => c.id === id);
  if (!pet || !client) notFound();

  const siblingRows = matchingPetRows(
    pet,
    pets.filter((candidate) => candidate.client_id === id),
  );
  const siblingIds = new Set(siblingRows.map((row) => row.id));
  const petAppointments = appointments.filter((a) => siblingIds.has(a.pet_id));
  const petVaccinations = vaccinations.filter((v) => siblingIds.has(v.pet_id));
  const inferredTypicalFee = pet.typical_fee ?? lastKnownPrice(petAppointments);

  return (
    <main className="px-4 py-4">
      <BackLink
        href={`/clients/${client.id}`}
        label={fullName(client.first_name, client.last_name)}
      />

      <header className="mt-2">
        <h1 className="text-2xl font-bold text-ink">{pet.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {describe(pet.breed, pet.sex, pet.color)}
        </p>
        <Link
          href={`/clients/${client.id}`}
          className="mt-1 inline-block text-sm font-medium text-brand"
        >
          Owner: {fullName(client.first_name, client.last_name)}
        </Link>
        <EditPet
          client={client}
          pet={pet}
          mode={dataMode()}
          writesEnabled={isEditPetWriteEnabled()}
        />
      </header>

      {pet.allergies ? (
        <div className="mt-4">
          <AllergyAlert detail={pet.allergies_detail} />
        </div>
      ) : null}

      {siblingRows.length > 1 ? (
        <div className="mt-4 rounded-xl bg-warn-soft px-3.5 py-3 text-sm text-warn">
          <p className="font-semibold">Combined pet history</p>
          <p className="mt-1 text-xs leading-relaxed">
            This page combines {siblingRows.length} imported {pet.name} records
            so Sam can see the full history in one place.
          </p>
        </div>
      ) : null}

      {pet.grooming_notes ? (
        <section className="mt-5">
          <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Grooming notes
          </h2>
          <p className="rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink">
            {pet.grooming_notes}
          </p>
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Vaccinations
        </h2>
        <VaccinationList vaccinations={petVaccinations} />
      </section>

      <section className="mt-5">
        <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Details
        </h2>
        <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
          <Detail
            label="Typical fee"
            value={
              inferredTypicalFee != null
                ? `${formatMoney(inferredTypicalFee)}${
                    pet.typical_fee == null ? " from history" : ""
                  }`
                : "Not set"
            }
          />
          <Detail label="Date of birth" value={pet.date_of_birth ? formatDate(pet.date_of_birth) : "Not recorded"} />
          <Detail label="Color" value={pet.color ?? "Not recorded"} />
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Appointment history
        </h2>
        <AppointmentHistory appointments={petAppointments} />
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
