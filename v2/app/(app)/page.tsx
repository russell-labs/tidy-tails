import { HomeSearch } from "@/components/HomeSearch";
import type { HouseholdCardData } from "@/components/HouseholdCard";
import { dataMode, loadDataset } from "@/lib/data/repo";
import { lastAppointment, usualPrice, usualService } from "@/lib/derive";
import { fullName } from "@/lib/format";
import { isPetPassedAway } from "@/lib/petLifecycle";

// Render per request: the cards show time-relative labels ("12 days ago") that
// must be computed against the current date, not frozen at build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { clients, pets, appointments } = await loadDataset();

  // Build one card per household. "Usual service / price" and "last visit" are
  // derived from appointment history on read — no stored columns (PRD §6).
  const households: HouseholdCardData[] = clients.map((client) => {
    const clientAppointments = appointments.filter(
      (a) => a.client_id === client.id,
    );
    const ownPets = pets.filter((p) => p.client_id === client.id);

    return {
      id: client.id,
      firstName: client.first_name,
      lastName: client.last_name,
      name: fullName(client.first_name, client.last_name),
      phone: client.phone,
      lastVisit: lastAppointment(clientAppointments)?.date ?? null,
      pets: ownPets.map((pet) => {
        const petAppointments = clientAppointments.filter(
          (a) => a.pet_id === pet.id,
        );
        return {
          id: pet.id,
          name: pet.name,
          breed: pet.breed,
          allergies: pet.allergies,
          lastVisit: lastAppointment(petAppointments)?.date ?? null,
          usualService: usualService(petAppointments),
          usualPrice: usualPrice(petAppointments),
          passedAway: isPetPassedAway(pet),
        };
      }),
    };
  });

  return <HomeSearch households={households} mode={dataMode()} />;
}
