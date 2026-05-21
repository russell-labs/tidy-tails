import type { Appointment, Pet } from "./data/types";
import type { ServiceType } from "./booking";

export type SizeClass = "small" | "medium" | "large" | "xl" | "unknown";
export type FitStatus = "open" | "possible" | "heavy" | "not_recommended";

export type DogWorkProfile = {
  size: SizeClass;
  points: number;
  tags: string[];
  summary: string;
};

export type DayFitAssessment = {
  date: string;
  status: FitStatus;
  totalDogs: number;
  largeDogs: number;
  loadPoints: number;
  projectedDogs: number;
  projectedLargeDogs: number;
  projectedLoadPoints: number;
  messages: string[];
  dogProfile: DogWorkProfile | null;
};

export type DaySummary = {
  date: string;
  totalDogs: number;
  largeDogs: number;
  loadPoints: number;
  status: FitStatus;
  messages: string[];
};

export type CapacityPet = Pet & {
  size?: string | null;
  temperament_notes?: string | null;
  behavior_flags?: string[] | string | null;
  grooming_style?: string | null;
  clip_style?: string | null;
};

const TARGET_POINTS = 7.5;
const HEAVY_POINTS = 6.25;
const LARGE_DOG_MAX = 3;

const LARGE_BREEDS = [
  "bernese",
  "boxer",
  "german shepherd",
  "golden",
  "husky",
  "labrador",
  "newfoundland",
  "retriever",
  "samoyed",
  "shepherd",
  "standard poodle",
];

const SMALL_BREEDS = [
  "bichon",
  "chihuahua",
  "dachshund",
  "havanese",
  "maltese",
  "miniature",
  "pomeranian",
  "shih tzu",
  "york",
];

function textBlob(pet: CapacityPet, serviceType?: ServiceType | string | null) {
  const flags = Array.isArray(pet.behavior_flags)
    ? pet.behavior_flags.join(" ")
    : (pet.behavior_flags ?? "");
  return [
    pet.breed,
    pet.grooming_notes,
    pet.temperament_notes,
    pet.grooming_style,
    pet.clip_style,
    flags,
    serviceType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function inferSizeClass(pet: CapacityPet): SizeClass {
  const explicit = (pet.size ?? "").trim().toLowerCase();
  if (["small", "medium", "large", "xl"].includes(explicit)) {
    return explicit as SizeClass;
  }

  const breed = (pet.breed ?? "").toLowerCase();
  if (LARGE_BREEDS.some((keyword) => breed.includes(keyword))) return "large";
  if (SMALL_BREEDS.some((keyword) => breed.includes(keyword))) return "small";
  return "medium";
}

export function dogWorkProfile(
  pet: CapacityPet | null | undefined,
  serviceType?: ServiceType | string | null,
): DogWorkProfile | null {
  if (!pet) return null;
  const size = inferSizeClass(pet);
  const notes = textBlob(pet, serviceType);
  const tags: string[] = [];

  let points =
    size === "small"
      ? 1
      : size === "medium"
        ? 1.35
        : size === "large"
          ? 2
          : size === "xl"
            ? 2.5
            : 1.35;

  if (serviceType === "nail_trim") {
    points -= 0.55;
    tags.push("quick service");
  } else if (serviceType === "bath_only") {
    points -= 0.25;
    tags.push("bath-only");
  } else if (serviceType === "full_groom") {
    points += 0.35;
    tags.push("full groom");
  }

  const styled =
    /\b(style|styled|scissor|topknot|teddy|round|bichon|continental|clip comb|comb|number 3|#3|no\.?\s*3)\b/.test(
      notes,
    );
  const straightShave =
    /\b(shave|shaved|short all over|same length|7 blade|#7|no\.?\s*7|complete cut|short puppy cut)\b/.test(
      notes,
    );
  const longCoat = /\b(long coat|long hair|keep length|keep the length|fluffy|double coat|undercoat|de-shed|deshed|blow-out)\b/.test(
    notes,
  );
  const behavior =
    /\b(aggressive|bite|bites|difficult|wary|nervous|anxious|reactive|high energy|firm hand|two-person|two person)\b/.test(
      notes,
    );
  const matted = /\b(matt|matts|matted)\b/.test(notes);

  if (styled) {
    points += 0.6;
    tags.push("styled finish");
  }
  if (longCoat) {
    points += 0.45;
    tags.push("long/dense coat");
  }
  if (straightShave) {
    points -= 0.25;
    tags.push("straight shave/short cut");
  }
  if (behavior) {
    points += 0.55;
    tags.push("extra handling");
  }
  if (matted && !straightShave) {
    points += 0.35;
    tags.push("matting risk");
  } else if (matted) {
    tags.push("matting noted");
  }

  const rounded = Math.max(0.5, Math.round(points * 4) / 4);
  const summaryParts = [
    size === "unknown" ? "size unknown" : `${size} dog`,
    tags[0],
    tags[1],
  ].filter(Boolean);

  return {
    size,
    points: rounded,
    tags,
    summary: summaryParts.join(" · "),
  };
}

export function summarizeDayLoad({
  date,
  appointments,
  pets,
}: {
  date: string;
  appointments: Appointment[];
  pets: CapacityPet[];
}): DaySummary {
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const booked = appointments.filter(
    (appointment) =>
      appointment.date === date && (appointment.status ?? "completed") === "booked",
  );
  const profiles = booked
    .map((appointment) =>
      dogWorkProfile(petsById.get(appointment.pet_id), appointment.service),
    )
    .filter((profile): profile is DogWorkProfile => profile != null);

  const loadPoints = Math.round(
    profiles.reduce((sum, profile) => sum + profile.points, 0) * 4,
  ) / 4;
  const largeDogs = profiles.filter(
    (profile) => profile.size === "large" || profile.size === "xl",
  ).length;
  const messages = dayMessages(booked.length, largeDogs, loadPoints);

  return {
    date,
    totalDogs: booked.length,
    largeDogs,
    loadPoints,
    status: statusForLoad(booked.length, largeDogs, loadPoints),
    messages,
  };
}

export function assessDayFit({
  date,
  appointments,
  pets,
  candidatePet,
  serviceType,
}: {
  date: string;
  appointments: Appointment[];
  pets: CapacityPet[];
  candidatePet?: CapacityPet | null;
  serviceType?: ServiceType | string | null;
}): DayFitAssessment {
  const summary = summarizeDayLoad({ date, appointments, pets });
  const dogProfile = dogWorkProfile(candidatePet, serviceType);
  const projectedDogs = summary.totalDogs + (dogProfile ? 1 : 0);
  const projectedLargeDogs =
    summary.largeDogs +
    (dogProfile?.size === "large" || dogProfile?.size === "xl" ? 1 : 0);
  const projectedLoadPoints =
    Math.round((summary.loadPoints + (dogProfile?.points ?? 0)) * 4) / 4;
  const status = statusForLoad(
    projectedDogs,
    projectedLargeDogs,
    projectedLoadPoints,
  );
  const messages = dayMessages(projectedDogs, projectedLargeDogs, projectedLoadPoints);

  if (dogProfile) {
    messages.unshift(
      `This dog reads as ${dogProfile.summary || "a normal groom"} (${dogProfile.points.toFixed(2).replace(/\.00$/, "")} load points).`,
    );
  }
  if (serviceType == null || serviceType === "") {
    messages.unshift("Choose the likely service to make this fit check sharper.");
  }

  return {
    date,
    status,
    totalDogs: summary.totalDogs,
    largeDogs: summary.largeDogs,
    loadPoints: summary.loadPoints,
    projectedDogs,
    projectedLargeDogs,
    projectedLoadPoints,
    messages,
    dogProfile,
  };
}

function statusForLoad(dogs: number, largeDogs: number, points: number): FitStatus {
  if (largeDogs > LARGE_DOG_MAX) return "not_recommended";
  if (points > TARGET_POINTS) return "heavy";
  if (points >= HEAVY_POINTS || dogs >= 5 || largeDogs === LARGE_DOG_MAX) {
    return "possible";
  }
  return "open";
}

function dayMessages(dogs: number, largeDogs: number, points: number): string[] {
  const messages = [
    `${dogs} dog${dogs === 1 ? "" : "s"} booked/projected · ${largeDogs} large · ${points.toFixed(2).replace(/\.00$/, "")} load points.`,
  ];
  if (largeDogs > LARGE_DOG_MAX) {
    messages.push("Usually too many large dogs for one day.");
  } else if (largeDogs === LARGE_DOG_MAX) {
    messages.push("At Sam's usual large-dog maximum.");
  }
  if (points > TARGET_POINTS) {
    messages.push("This looks heavier than a normal day. Sam should choose deliberately.");
  } else if (points >= HEAVY_POINTS) {
    messages.push("This is a fuller day, but may still work depending on coat and temperament.");
  }
  if (dogs === 0) messages.push("No Tidy Tails bookings on this day yet.");
  return messages;
}
