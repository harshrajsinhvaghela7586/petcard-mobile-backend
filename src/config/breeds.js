/*
 * Breed knowledge used by: the breed picker, the daily goals (food / water /
 * activity), the care score and the "Know" guides. Numbers are typical adult
 * values for general guidance, never a replacement for a vet's advice.
 *
 * size   : toy | small | medium | large | giant   (rabbits: dwarf | small | medium | large | giant)
 * energy : low | medium | high | very_high
 * coat   : short | medium | long | double | curly | wire | hairless | wool
 * shed   : low | medium | high
 */
const B = (label, size, energy, coat, shed, life, origin, temperament, kg, flags, concerns) => ({
  label,
  key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  size, energy, coat, shed, life, origin, temperament, kg, flags, concerns,
});

export const BREEDS = Object.freeze({
  dog: [
    B("Hungarian Vizsla", "medium", "very_high", "short", "medium", "12–14 years", "Hungary", "Affectionate, energetic, people-focused", [20, 30], ["needs_job", "cold_sensitive", "long_ears", "working"], ["Hip dysplasia", "Epilepsy", "Hypothyroidism", "Separation anxiety"]),
    B("Border Collie", "medium", "very_high", "medium", "medium", "12–15 years", "United Kingdom", "Highly intelligent, energetic, focused", [14, 20], ["working", "needs_job", "noise_sensitive"], ["Hip dysplasia", "Collie eye anomaly", "Epilepsy", "Noise anxiety"]),
    B("Japanese Akita", "large", "medium", "double", "high", "10–13 years", "Japan", "Loyal, dignified, reserved with strangers", [32, 45], ["heat_sensitive", "double_coat", "bloat_risk", "working"], ["Hip dysplasia", "Autoimmune disease", "Hypothyroidism", "Bloat (GDV)"]),
  ],
  cat: [
    B("Persian", "medium", "low", "long", "high", "12–17 years", "Iran (Persia)", "Gentle, quiet, sweet-natured", [3.5, 7], ["brachycephalic", "tear_staining", "daily_grooming"], ["Polycystic kidney disease", "Breathing and eye problems", "Dental crowding", "Matted coat"]),
    B("Himalayan", "medium", "low", "long", "high", "9–15 years", "United States / United Kingdom", "Sweet, gentle, calm", [3, 6], ["brachycephalic", "tear_staining", "daily_grooming"], ["Polycystic kidney disease", "Breathing and eye problems", "Dental crowding", "Matted coat"]),
  ],
  rabbit: [
    B("Holland Lop", "small", "medium", "short", "medium", "7–10 years", "Netherlands", "Friendly, playful, gentle", [1.6, 1.8], ["lop_ears", "dental_prone"], ["Dental problems", "Ear infections", "Gut stasis", "Obesity"]),
    B("NewZealand Bunny", "large", "medium", "short", "medium", "5–8 years", "United States", "Docile, calm, relaxed", [4, 5.4], ["sore_hocks_prone", "needs_space"], ["Sore hocks", "Obesity", "Gut stasis", "Dental problems"]),
  ],
});

/** Used when the breed is "Other" / unknown. */
export const SPECIES_DEFAULT = Object.freeze({
  dog: { label: "Dog", size: "medium", energy: "medium", coat: "short", shed: "medium", life: "10–14 years", origin: "Worldwide", temperament: "Varies by individual", kg: [10, 25], flags: [], concerns: ["Dental disease", "Obesity", "Skin and ear infections", "Parasites"] },
  cat: { label: "Cat", size: "medium", energy: "medium", coat: "short", shed: "medium", life: "12–16 years", origin: "Worldwide", temperament: "Varies by individual", kg: [3, 5], flags: [], concerns: ["Dental disease", "Obesity", "Urinary problems", "Parasites"] },
  rabbit: { label: "Rabbit", size: "small", energy: "medium", coat: "short", shed: "medium", life: "7–10 years", origin: "Worldwide", temperament: "Varies by individual", kg: [1.5, 3], flags: ["dental_prone"], concerns: ["Dental problems", "Gut stasis", "Respiratory infections", "Obesity"] },
});

/** "Other" breeds are typed by the owner: keep them short. */
export const MAX_CUSTOM_BREED_LENGTH = 30;
export const BREED_TEXT_RE = /^[\p{L}\p{M}\p{N} '.’&()\/-]+$/u;

export const PET_TYPES = Object.freeze(["dog", "cat", "rabbit"]);

const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Fuzzy match "golden retriever", "Labrador", "lab mix" ... to a known breed. */
export function findBreed(type, breedName) {
  const list = BREEDS[type] || [];
  const q = norm(breedName);
  if (q.length < 3) return null;
  return (
    list.find((b) => norm(b.label) === q) ??
    list.find((b) => q.includes(norm(b.label)) || norm(b.label).includes(q)) ??
    list.find((b) => norm(b.label).split(" ").some((w) => w.length > 3 && q.split(" ").includes(w))) ??
    null
  );
}

export function breedProfile(type, breedName) {
  const species = SPECIES_DEFAULT[type] || SPECIES_DEFAULT.dog;
  const match = findBreed(type, breedName);
  if (match) return { ...match, known: true };
  return { ...species, key: "other", known: false, label: String(breedName || "").trim() || species.label };
}

export const breedOptions = (type) => [...(BREEDS[type] || []).map((b) => b.label), "Other"];

const monthsBetween = (birthDate, today) => {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  return Math.max(0, months);
};

const SENIOR_YEARS = {
  dog: { toy: 9, small: 9, medium: 8, large: 7, giant: 6 },
  cat: { default: 11 },
  rabbit: { dwarf: 7, small: 7, medium: 6, large: 5, giant: 5 },
};

/** { months, years, stage: "baby" | "young" | "adult" | "senior" | "unknown", label } */
export function ageInfo(type, birthDate, today, size = "medium") {
  const months = monthsBetween(birthDate, today);
  if (months === null) return { months: null, years: null, stage: "unknown", label: "age not set" };
  const years = Math.floor(months / 12);
  const seniorYears = (SENIOR_YEARS[type] || SENIOR_YEARS.dog)[size] ?? SENIOR_YEARS[type]?.default ?? 8;
  const babyUntil = type === "rabbit" ? 3 : 4;
  const youngUntil = type === "dog" && (size === "large" || size === "giant") ? 18 : type === "rabbit" ? 6 : 12;
  let stage = "adult";
  if (months < babyUntil) stage = "baby";
  else if (months < youngUntil) stage = "young";
  else if (years >= seniorYears) stage = "senior";
  const label = months < 24 ? `${months} month${months === 1 ? "" : "s"} old` : `${years} years old`;
  return { months, years, stage, label };
}

export const stageName = (type, stage) =>
  ({
    dog: { baby: "puppy", young: "growing puppy", adult: "adult", senior: "senior", unknown: "dog" },
    cat: { baby: "kitten", young: "young cat", adult: "adult", senior: "senior", unknown: "cat" },
    rabbit: { baby: "baby rabbit", young: "young rabbit", adult: "adult", senior: "senior", unknown: "rabbit" },
  }[type]?.[stage] ?? "pet");
