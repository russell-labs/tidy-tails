import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddAppointment } from "@/components/AddAppointment";
import { AddPet } from "@/components/AddPet";
import { AppointmentHistory } from "@/components/AppointmentHistory";
import { BackLink } from "@/components/BackLink";
import { ClientActions } from "@/components/ClientActions";
import { ClientSmsConversation } from "@/components/ClientSmsConversation";
import { EditClient } from "@/components/EditClient";
import { LogGroom } from "@/components/LogGroom";
import { PetCard } from "@/components/PetCard";
import { dataMode, getClientRecord, loadVaccinations } from "@/lib/data/repo";
import { groupPetsForDisplay, lastAppointment } from "@/lib/derive";
import { digitsOnly, formatPhone, fullName } from "@/lib/format";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { activePets } from "@/lib/petLifecycle";
import {
  isAddAppointmentWriteEnabled,
  isEditAppointmentWriteEnabled,
  isEditClientWriteEnabled,
  isLogGroomWriteEnabled,
} from "@/lib/writeGate";
import {
  hasClientOutboundSms,
  loadClientSmsMessages,
} from "@/lib/smsMessages.server";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string; week?: string }>;
}) {
  const { id } = await params;
  const source = searchParams ? await searchParams : {};
  const record = await getClientRecord(id);
  if (!record) notFound();

  const { client, pets, appointments } = record;
  const operatorSettings = await readOperatorSettings();
  const recentSmsMessages = await loadClientSmsMessages(client.id, 12);
  const hasPriorOutboundSms = await hasClientOutboundSms(client.id);
  const allVaccinations = await loadVaccinations();
  const petsById = Object.fromEntries(pets.map((p) => [p.id, p.name]));
  const petGroups = groupPetsForDisplay(pets, appointments);
  const displayedPets = petGroups.map((group) => group.pet);
  const bookablePets = activePets(displayedPets);
  const activeHouseholdPets = activePets(pets);
  const combinedGroups = petGroups.filter((group) => group.pets.length > 1);

  return (
    <main className="px-4 py-4">
      <BackLink
        href={
          source.from === "schedule"
            ? `/schedule${source.week ? `?week=${source.week}` : ""}`
            : "/"
        }
        label={source.from === "schedule" ? "Schedule" : "Search"}
      />

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
        <EditClient
          client={client}
          mode={dataMode()}
          writesEnabled={isEditClientWriteEnabled()}
        />
      </header>

      <div className="mt-4 flex flex-col gap-2.5">
        <AddAppointment
          client={client}
          pets={bookablePets}
          appointments={appointments}
          mode={dataMode()}
          writesEnabled={isAddAppointmentWriteEnabled()}
          bookingConfirmationTemplate={
            operatorSettings.bookingConfirmationTemplate
          }
          firstPlatformTextTemplate={operatorSettings.firstPlatformTextTemplate}
          scheduleCalibration={operatorSettings.scheduleCalibration}
          locationSettings={operatorSettings.locationSettings}
          hasPriorOutboundSms={hasPriorOutboundSms}
        />
        <LogGroom
          client={client}
          pets={bookablePets}
          appointments={appointments}
          mode={dataMode()}
          writesEnabled={isLogGroomWriteEnabled()}
        />
        <ClientActions
          client={client}
          pets={activeHouseholdPets}
          appointments={appointments}
          mode={dataMode()}
          reminderSettings={operatorSettings}
        />
      </div>

      {client.notes ? (
        <p className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink">
          {client.notes}
        </p>
      ) : null}

      <ClientSmsConversation client={client} messages={recentSmsMessages} />

      {combinedGroups.length > 0 ? (
        <div className="mt-4 rounded-xl bg-warn-soft px-3.5 py-3 text-sm text-warn">
          <p className="font-semibold">History combined from duplicate records</p>
          <p className="mt-1 text-xs leading-relaxed">
            {combinedGroups
              .map((group) => `${group.pet.name} x${group.pets.length}`)
              .join(", ")}{" "}
            were imported as split rows. They are shown once here with combined
            history.
          </p>
        </div>
      ) : null}

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            {petGroups.length === 1 ? "Pet" : `Pets · ${petGroups.length}`}
          </h2>
          <AddPet client={client} mode={dataMode()} />
        </div>
        {petGroups.length === 0 ? (
          <p className="text-sm text-ink-faint">No pets on file.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {petGroups.map((group) => (
              <PetCard
                key={group.pet.id}
                pet={group.pet}
                clientId={client.id}
                vaccinations={allVaccinations.filter((v) =>
                  group.pets.some((pet) => pet.id === v.pet_id),
                )}
                lastVisit={lastAppointment(group.appointments)}
                recordCount={group.pets.length}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Appointment history
        </h2>
        <AppointmentHistory
          appointments={appointments}
          clientId={client.id}
          petsById={petsById}
          customerPhone={client.phone}
          mode={dataMode()}
          writesEnabled={isEditAppointmentWriteEnabled()}
          locationSettings={operatorSettings.locationSettings}
        />
      </section>
    </main>
  );
}
