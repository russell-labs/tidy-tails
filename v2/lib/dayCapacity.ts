import type { Appointment, Pet } from "./data/types";
import type { BookingLocation, ServiceType } from "./booking";
import {
  DEFAULT_SCHEDULE_CALIBRATION,
  type ScheduleCalibration,
} from "./operatorSettings";

export type SizeClass = "small" | "medium" | "large" | "xl" | "unknown";
export type FitStatus = "open" | "possible" | "heavy" | "not_recommended";

export type DogWorkProfile = {
  size: SizeClass;
  points: number;
  tags: string[];
  summary: string;
  specialHandlingMessage: string | null;
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
  dogProfiles: DogWorkProfile[];
};

export type DaySummary = {
  date: string;
  totalDogs: number;
  largeDogs: number;
  loadPoints: number;
  status: FitStatus;
  messages: string[];
};

type LocationFit = {
  location: BookingLocation | null;
  largeDogsAtLocation: number | null;
  largeCrateLimit: number | null;
  message: string | null;
};

export type CapacityPet = Pet & {
  size?: string | null;
  temperament_notes?: string | null;
  behavior_flags?: string[] | string | null;
  grooming_style?: string | null;
  clip_style?: string | null;
};

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
    pet.name,
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

function petDisplayName(pet: CapacityPet): string {
  return pet.name?.trim() || "This dog";
}

function specialHandlingMessage(pet: CapacityPet): string | null {
  const name = petDisplayName(pet);
  if (/\bjackson\s+wicks\b/i.test(name)) {
    return "Jackson Wicks is a special handling dog: book at the end of day with no other dogs in the shop.";
  }
  return null;
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
  calibration: ScheduleCalibration = DEFAULT_SCHEDULE_CALIBRATION,
): DogWorkProfile | null {
  if (!pet) return null;
  const size = inferSizeClass(pet);
  const notes = textBlob(pet, serviceType);
  const tags: string[] = [];
  const specialMessage = specialHandlingMessage(pet);

  let points =
    size === "small"
      ? calibration.smallDogPoints
      : size === "medium"
        ? calibration.mediumDogPoints
        : size === "large"
          ? calibration.largeDogPoints
          : size === "xl"
            ? calibration.xlDogPoints
            : calibration.mediumDogPoints;

  if (serviceType === "nail_trim") {
    points += calibration.nailTrimAdjustment;
    tags.push("quick service");
  } else if (serviceType === "bath_only") {
    points += calibration.bathOnlyAdjustment;
    tags.push("bath-only");
  } else if (serviceType === "full_groom") {
    points += calibration.fullGroomAdjustment;
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
    points += calibration.styleAdjustment;
    tags.push("styled finish");
  }
  if (longCoat) {
    points += calibration.longCoatAdjustment;
    tags.push("long/dense coat");
  }
  if (straightShave) {
    points += calibration.straightShaveAdjustment;
    tags.push("straight shave/short cut");
  }
  if (behavior) {
    points += calibration.behaviorAdjustment;
    tags.push("extra handling");
  }
  if (matted && !straightShave) {
    points += calibration.mattingAdjustment;
    tags.push("matting risk");
  } else if (matted) {
    tags.push("matting noted");
  }
  if (specialMessage) {
    points += calibration.behaviorAdjustment;
    tags.push("special handling");
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
    specialHandlingMessage: specialMessage,
  };
}

function locationCrateLimit(
  location: BookingLocation | string | null | undefined,
  calibration: ScheduleCalibration,
): number | null {
  if (location === "annette") return calibration.annetteLargeCrateLimit;
  if (location === "gina") return calibration.ginaLargeCrateLimit;
  return null;
}

function locationName(location: BookingLocation | string | null | undefined): string {
  if (location === "annette") return "Annette's";
  if (location === "gina") return "Gina's";
  return "this location";
}

function largeDogsAtLocation({
  date,
  location,
  appointments,
  petsById,
  calibration,
}: {
  date: string;
  location: BookingLocation | string | null | undefined;
  appointments: Appointment[];
  petsById: Map<string, CapacityPet>;
  calibration: ScheduleCalibration;
}): number | null {
  if (!location) return null;
  let count = 0;
  for (const appointment of appointments) {
    if (appointment.date !== date) continue;
    if ((appointment.status ?? "completed") !== "booked") continue;
    if (appointment.location !== location) continue;
    const profile = dogWorkProfile(
      petsById.get(appointment.pet_id),
      appointment.service,
      calibration,
    );
    if (profile?.size === "large" || profile?.size === "xl") count += 1;
  }
  return count;
}

function locationFitMessage({
  location,
  largeDogs,
  calibration,
}: {
  location: BookingLocation | string | null | undefined;
  largeDogs: number | null;
  calibration: ScheduleCalibration;
}): LocationFit {
  const largeCrateLimit = locationCrateLimit(location, calibration);
  if (!location || largeCrateLimit == null || largeDogs == null) {
    return {
      location: null,
      largeDogsAtLocation: null,
      largeCrateLimit: null,
      message: null,
    };
  }

  if (largeDogs > largeCrateLimit) {
    return {
      location: location as BookingLocation,
      largeDogsAtLocation: largeDogs,
      largeCrateLimit,
      message: `${locationName(location)} has ${largeCrateLimit} large crates; ${largeDogs} large dogs may not fit while drying.`,
    };
  }
  if (largeDogs === largeCrateLimit) {
    return {
      location: location as BookingLocation,
      largeDogsAtLocation: largeDogs,
      largeCrateLimit,
      message: `${locationName(location)} large crates would be full with ${largeDogs} large dogs.`,
    };
  }
  return {
    location: location as BookingLocation,
    largeDogsAtLocation: largeDogs,
    largeCrateLimit,
    message: null,
  };
}

export function summarizeDayLoad({
  date,
  appointments,
  pets,
  calibration = DEFAULT_SCHEDULE_CALIBRATION,
  location = null,
}: {
  date: string;
  appointments: Appointment[];
  pets: CapacityPet[];
  calibration?: ScheduleCalibration;
  location?: BookingLocation | string | null;
}): DaySummary {
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const booked = appointments.filter(
    (appointment) =>
      appointment.date === date && (appointment.status ?? "completed") === "booked",
  );
  const profiles = booked
    .map((appointment) =>
      dogWorkProfile(
        petsById.get(appointment.pet_id),
        appointment.service,
        calibration,
      ),
    )
    .filter((profile): profile is DogWorkProfile => profile != null);

  const loadPoints = Math.round(
    profiles.reduce((sum, profile) => sum + profile.points, 0) * 4,
  ) / 4;
  const largeDogs = profiles.filter(
    (profile) => profile.size === "large" || profile.size === "xl",
  ).length;
  const locationLargeDogs = largeDogsAtLocation({
    date,
    location,
    appointments,
    petsById,
    calibration,
  });
  const fit = locationFitMessage({
    location,
    largeDogs: locationLargeDogs,
    calibration,
  });
  const messages = dayMessages(
    booked.length,
    largeDogs,
    loadPoints,
    calibration,
    fit,
  );

  return {
    date,
    totalDogs: booked.length,
    largeDogs,
    loadPoints,
    status: statusForLoad(booked.length, largeDogs, loadPoints, calibration, fit),
    messages,
  };
}

export function assessDayFit({
  date,
  appointments,
  pets,
  candidatePet,
  candidatePets,
  serviceType,
  calibration = DEFAULT_SCHEDULE_CALIBRATION,
  location = null,
}: {
  date: string;
  appointments: Appointment[];
  pets: CapacityPet[];
  candidatePet?: CapacityPet | null;
  candidatePets?: {
    pet: CapacityPet | null | undefined;
    serviceType?: ServiceType | string | null;
  }[];
  serviceType?: ServiceType | string | null;
  calibration?: ScheduleCalibration;
  location?: BookingLocation | string | null;
}): DayFitAssessment {
  const summary = summarizeDayLoad({ date, appointments, pets, calibration });
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const dogProfiles = (
    candidatePets
      ? candidatePets.map((candidate) =>
          dogWorkProfile(
            candidate.pet,
            candidate.serviceType ?? serviceType,
            calibration,
          ),
        )
      : [dogWorkProfile(candidatePet, serviceType, calibration)]
  ).filter((profile): profile is DogWorkProfile => profile != null);
  const dogProfile = dogProfiles[0] ?? null;
  const projectedDogs = summary.totalDogs + dogProfiles.length;
  const projectedLargeDogs =
    summary.largeDogs +
    dogProfiles.filter(
      (profile) => profile.size === "large" || profile.size === "xl",
    ).length;
  const candidateLargeDogs = dogProfiles.filter(
    (profile) => profile.size === "large" || profile.size === "xl",
  ).length;
  const bookedLargeDogsAtLocation = largeDogsAtLocation({
    date,
    location,
    appointments,
    petsById,
    calibration,
  });
  const projectedLargeDogsAtLocation =
    bookedLargeDogsAtLocation == null
      ? null
      : bookedLargeDogsAtLocation + candidateLargeDogs;
  const fit = locationFitMessage({
    location,
    largeDogs: projectedLargeDogsAtLocation,
    calibration,
  });
  const projectedLoadPoints =
    Math.round(
      (summary.loadPoints +
        dogProfiles.reduce((sum, profile) => sum + profile.points, 0)) *
        4,
    ) / 4;
  const status = statusForLoad(
    projectedDogs,
    projectedLargeDogs,
    projectedLoadPoints,
    calibration,
    fit,
  );
  const messages = dayMessages(
    projectedDogs,
    projectedLargeDogs,
    projectedLoadPoints,
    calibration,
    fit,
  );

  for (const profile of dogProfiles) {
    if (profile.specialHandlingMessage) messages.unshift(profile.specialHandlingMessage);
  }

  if (dogProfiles.length > 1) {
    const points = dogProfiles
      .reduce((sum, profile) => sum + profile.points, 0)
      .toFixed(2)
      .replace(/\.00$/, "");
    messages.unshift(
      `These dogs read as ${dogProfiles.map((profile) => profile.summary || "a normal groom").join("; ")} (${points} load points total).`,
    );
  } else if (dogProfile) {
    messages.unshift(
      `This dog reads as ${dogProfile.summary || "a normal groom"} (${dogProfile.points.toFixed(2).replace(/\.00$/, "")} load points).`,
    );
  }
  const hasCandidateServiceContext = candidatePets
    ? candidatePets.every((candidate) => Boolean(candidate.serviceType))
    : false;
  if (!hasCandidateServiceContext && (serviceType == null || serviceType === "")) {
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
    dogProfiles,
  };
}

function statusForLoad(
  dogs: number,
  largeDogs: number,
  points: number,
  calibration: ScheduleCalibration,
  fit: LocationFit,
): FitStatus {
  if (fit.largeCrateLimit != null && (fit.largeDogsAtLocation ?? 0) > fit.largeCrateLimit) {
    return "not_recommended";
  }
  const largeDogHardMax =
    fit.largeCrateLimit == null
      ? calibration.largeDogMax
      : Math.max(calibration.largeDogMax, fit.largeCrateLimit);
  if (largeDogs > largeDogHardMax) return "not_recommended";
  if (points > calibration.targetLoadPoints) return "heavy";
  if (
    points >= calibration.heavyLoadPoints ||
    dogs >= calibration.heavyDogCount ||
    largeDogs === calibration.largeDogMax
  ) {
    return "possible";
  }
  return "open";
}

function dayMessages(
  dogs: number,
  largeDogs: number,
  points: number,
  calibration: ScheduleCalibration,
  fit: LocationFit,
): string[] {
  const messages = [
    `${dogs} dog${dogs === 1 ? "" : "s"} booked/projected · ${largeDogs} large · ${points.toFixed(2).replace(/\.00$/, "")} load points.`,
  ];
  if (largeDogs > calibration.largeDogMax) {
    messages.push(
      `${largeDogs} large dogs is usually too many large dogs for one day and is over Sam's usual labor maximum while bathing and drying solo.`,
    );
  } else if (largeDogs === calibration.largeDogMax) {
    messages.push(
      `${largeDogs} large dogs is Sam's usual labor maximum while bathing and drying solo.`,
    );
  }
  if (fit.message) messages.push(fit.message);
  if (points > calibration.targetLoadPoints) {
    messages.push(
      `${calibration.warningLanguage} This looks heavier than a normal day.`,
    );
  } else if (points >= calibration.heavyLoadPoints) {
    messages.push(
      `${calibration.warningLanguage} This is a fuller day, but may still work.`,
    );
  } else if (dogs >= calibration.heavyDogCount) {
    messages.push(`${calibration.warningLanguage} Dog count is at the caution point.`);
  }
  if (dogs === 0) messages.push("No Tidy Tails bookings on this day yet.");
  return messages;
}
