import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AllergyAlert } from "@/components/AllergyAlert";
import { AppointmentHistory } from "@/components/AppointmentHistory";
import { BackLink } from "@/components/BackLink";
import { EditPet } from "@/components/EditPet";
import { LogGroom } from "@/components/LogGroom";
import { MovePetOwner } from "@/components/MovePetOwner";
import { PetLifecycleActions } from "@/components/PetLifecycleActions";
import { ReadyPickupMessage } from "@/components/ReadyPickupMessage";
import { StatusPill } from "@/components/StatusPill";
import { VaccinationList } from "@/components/VaccinationList";
import { dataMode, loadDataset } from "@/lib/data/repo";
import { lastKnownPrice, matchingPetRows } from "@/lib/derive";
import { formatDate, formatMoney, fullName } from "@/lib/format";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import { formatPetAge } from "@/lib/petAge";
import { isPetPassedAway } from "@/lib/petLifecycle";
import {
  isEditAppointmentWriteEnabled,
  isEditPetWriteEnabled,
  isLogGroomWriteEnabled,
} from "@/lib/writeGate";

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

function sizeLabel(size: string | null | undefined): string {
  if (size === "small") return "Small";
  if (size === "medium") return "Medium";
  if (size === "large") return "Large";
  if (size === "xl") return "Extra large";
  return "Not recorded";
}

export default async function PetDetailPage({
  params,
}: {
  params: Promise<{ id: string; petId: string }>;
}) {
  const { id, petId } = await params;
  const { clients, pets, appointments, vaccinations } = await loadDataset();
  const settings = await readOperatorSettings();
  const orgSettings = await loadOrgSettings();

  const pet = pets.find((p) => p.id === petId && p.client_id === id);
  const client = clients.find((c) => c.id === id);
  if (!pet || !client) notFound();

  const siblingRows = matchingPetRows(
    pet,
    pets.filter((candidate) => candidate.client_id === id),
  );
  const siblingIds = new Set(siblingRows.map((row) => row.id));
  const petAppointments = appointments.filter((a) => siblingIds.has(a.pet_id));
  const exactPetAppointments = appointments.filter((a) => a.pet_id === pet.id);
  const petVaccinations = vaccinations.filter((v) => siblingIds.has(v.pet_id));
  const inferredTypicalFee = pet.typical_fee ?? lastKnownPrice(petAppointments);
  const passedAway = isPetPassedAway(pet);

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
        {passedAway ? (
          <div className="mt-2">
            <StatusPill tone="neutral">Passed away</StatusPill>
          </div>
        ) : null}
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
        <MovePetOwner
          pet={pet}
          currentClient={client}
          clients={clients}
          mode={dataMode()}
          writesEnabled={isEditPetWriteEnabled()}
        />
        <PetLifecycleActions
          client={client}
          pet={pet}
          pets={pets}
          clients={clients}
          hasAppointments={exactPetAppointments.length > 0}
          isPassedAway={passedAway}
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
            so you can see the full history in one place.
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
          <Detail label="Size" value={sizeLabel(pet.size)} />
          <Detail
            label="Age"
            value={
              pet.date_of_birth
                ? (formatPetAge(pet.date_of_birth) ?? "Not recorded")
                : (pet.age ?? "Not recorded")
            }
          />
          <Detail
            label="Birth date"
            value={pet.date_of_birth ? formatDate(pet.date_of_birth) : "Not recorded"}
          />
          <Detail label="Colour" value={pet.color ?? "Not recorded"} />
        </dl>
      </section>

      {!passedAway ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Today workflow
          </h2>
          <div className="grid gap-2">
            <LogGroom
              client={client}
              pets={[pet]}
              appointments={petAppointments}
              mode={dataMode()}
              writesEnabled={isLogGroomWriteEnabled()}
            />
            <ReadyPickupMessage
              client={client}
              pet={pet}
              mode={dataMode()}
              settings={{ readyPickupTemplate: settings.readyPickupTemplate }}
              operatorName={orgSettings.operatorName}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            If payment comes after pickup, log the groom as waiting on payment,
            then use Edit visit in history to mark it paid later.
          </p>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Appointment history
        </h2>
        <AppointmentHistory
          appointments={petAppointments}
          clientId={client.id}
          customerPhone={client.phone}
          mode={dataMode()}
          writesEnabled={isEditAppointmentWriteEnabled()}
          locationSettings={settings.locationSettings}
          operatorName={orgSettings.operatorName}
        />
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
