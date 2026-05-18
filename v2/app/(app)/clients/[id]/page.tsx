import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddAppointment } from "@/components/AddAppointment";
import { AddPet } from "@/components/AddPet";
import { AppointmentHistory } from "@/components/AppointmentHistory";
import { BackLink } from "@/components/BackLink";
import { ClientActions } from "@/components/ClientActions";
import { LogGroom } from "@/components/LogGroom";
import { PetCard } from "@/components/PetCard";
import { dataMode, getClientRecord, loadVaccinations } from "@/lib/data/repo";
import { lastAppointment } from "@/lib/derive";
import { digitsOnly, formatPhone, fullName } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const record = await getClientRecord(id);
  return {
    title: record
      ? fullName(record.client.first_name, record.client.last_name)
      : "Client",
  };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getClientRecord(id);
  if (!record) notFound();

  const { client, pets, appointments } = record;
  const allVaccinations = await loadVaccinations();
  const petsById = Object.fromEntries(pets.map((p) => [p.id, p.name]));

  return (
    <main className="px-4 py-4">
      <BackLink href="/" label="Search" />

      <header className="mt-2">
        <h1 className="text-2xl font-bold text-ink">
          {fullName(client.first_name, client.last_name)}
        </h1>
        <div className="mt-1 flex flex-col gap-0.5 text-sm">
          <a
            href={`tel:${digitsOnly(client.phone)}`}
            className="font-medium text-brand"
          >
            {formatPhone(client.phone)}
          </a>
          {client.alt_contact ? (
            <span className="text-ink-soft">{client.alt_contact}</span>
          ) : null}
          {client.address ? (
            <span className="text-ink-soft">{client.address}</span>
          ) : null}
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-2.5">
        <AddAppointment
          client={client}
          pets={pets}
          appointments={appointments}
          mode={dataMode()}
        />
        <LogGroom
          client={client}
          pets={pets}
          appointments={appointments}
          mode={dataMode()}
        />
        <ClientActions
          client={client}
          pets={pets}
          appointments={appointments}
          mode={dataMode()}
        />
      </div>

      {client.notes ? (
        <p className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink">
          {client.notes}
        </p>
      ) : null}

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            {pets.length === 1 ? "Pet" : `Pets · ${pets.length}`}
          </h2>
          <AddPet client={client} mode={dataMode()} />
        </div>
        {pets.length === 0 ? (
          <p className="text-sm text-ink-faint">No pets on file.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pets.map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                clientId={client.id}
                vaccinations={allVaccinations.filter((v) => v.pet_id === pet.id)}
                lastVisit={lastAppointment(
                  appointments.filter((a) => a.pet_id === pet.id),
                )}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Appointment history
        </h2>
        <AppointmentHistory appointments={appointments} petsById={petsById} />
      </section>
    </main>
  );
}
