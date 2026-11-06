import { BREEDS, PET_TYPES, SPECIES_DEFAULT } from "../config/breeds.js";


/*
 * Written content for the 9 inner "Know" guides, for every species and every breed in config/breeds.js.
 * seedKnowGuide.js turns this into KnowGuide documents (one per page + species + breed, plus one generic
 * document per page + species). Text uses {{petName}}; the server fills in the real name when it answers.
 * Wording avoids he/she so it fits any pet. General guidance only, no medicine doses.
 *
 * To add a breed: add it to config/breeds.js, add its data block in BREED_DATA below, run the seed again.
 */

const PN = "{{petName}}";

export const GUIDE_PAGE_KEYS = Object.freeze([
  "daily_routine", "hydration", "vaccination_guide", "ear_cleaning", "best_food_types",
  "bathing", "basic_commands", "car_safety", "common_health_issues",
  "love_attention", "playtime", "sleep_rest", "feeding_schedule", "human_foods", "treats_rewards",
  "brushing", "nail_care", "shedding_care", "exercise_needs", "mental_wellness", "signs_to_watch",
  "vet_check_ups", "home_safety", "outdoor_safety", "toxic_items", "weather_safety",
  "behavior_tips", "fun_games", "house_training", "leash_training","breed_information",
]);

export const GUIDE_TITLES = Object.freeze({
  daily_routine: "Daily Routine", hydration: "Hydration", vaccination_guide: "Vaccination Guide", ear_cleaning: "Ear Cleaning",
  best_food_types: "Best Food Types", bathing: "Bathing", basic_commands: "Basic Commands", car_safety: "Car Safety",
  common_health_issues: "Common Health Issues", love_attention: "Love & Attention", playtime: "Playtime", sleep_rest: "Sleep & Rest",
  feeding_schedule: "Feeding Schedule", human_foods: "Human Foods", treats_rewards: "Treats & Rewards",
  brushing: "Brushing", nail_care: "Nail Care", shedding_care: "Shedding Care", exercise_needs: "Exercise Needs",
  mental_wellness: "Mental Wellness", signs_to_watch: "Signs to Watch", vet_check_ups: "Vet Check-ups",
  home_safety: "Home Safety", outdoor_safety: "Outdoor Safety", toxic_items: "Toxic Items", weather_safety: "Weather Safety",
  behavior_tips: "Behavior Tips", fun_games: "Fun Games", house_training: "House Training", leash_training: "Leash Training",
  breed_information: "Breed Information",
});

const CHIPS = { common_health_issues: "Health & Wellness" };
export const GUIDE_FOOTER = `General guidance only. Please consult your vet for ${PN}'s specific needs.`;

/* ---------------------------------------------------------------- helpers */
const about = (heading, body, facts) => ({ type: "about", heading, body, ...(facts ? { facts } : {}) });
const list = (heading, items, { intro, tone = "good" } = {}) => ({ type: "list", heading, items, tone, ...(intro ? { intro } : {}) });
const timeline = (heading, steps, intro) => ({ type: "timeline", heading, steps, ...(intro ? { intro } : {}) });
const tip = (title, body, action) => ({ type: "tip", title, body, ...(action ? { action } : {}) });
const F = (label, value, icon) => ({ label, value, icon });
const I = (title, text, icon) => ({ title, text, icon });
const T = (tag, title, text) => ({ tag, title, text });
const OK = "check-circle-outline";
const WARN = "alert-circle-outline";

/** Replaces {{petName}} everywhere in a guide. */
export function applyPetName(value, name) {
  if (typeof value === "string") return value.replaceAll("{{petName}}", name);
  if (Array.isArray(value)) return value.map((v) => applyPetName(v, name));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyPetName(v, name)]));
  return value;
}

const SECTION_TYPES = new Set(["about", "list", "timeline", "tip"]);
export const isValidSections = (v) =>
  Array.isArray(v) && v.length >= 2 && v.every((s) => {
    if (!s || !SECTION_TYPES.has(s.type)) return false;
    if (s.type === "about") return typeof s.heading === "string" && typeof s.body === "string";
    if (s.type === "tip") return typeof s.title === "string" && typeof s.body === "string";
    if (s.type === "list") return typeof s.heading === "string" && Array.isArray(s.items) && s.items.length >= 1 && s.items.every((i) => typeof i?.title === "string");
    return typeof s.heading === "string" && Array.isArray(s.steps) && s.steps.length >= 1 && s.steps.every((i) => typeof i?.title === "string" && typeof i?.tag === "string");
  });

/* ------------------------------------------------------- species + breed data */
const GENERIC = {
  dog: {
    label: "dog", exercise: "30 – 90 minutes", brush: "Weekly", bathEvery: "Every 4 – 8 weeks, or when dirty",
    bathNote: "Washing too often dries out the skin and strips the natural oils.",
    earFreq: "Check weekly, clean every 2 – 4 weeks", earNote: "Healthy ears are light pink with little smell. Floppy or hairy ears trap more moisture.",
    foodAbout: "A complete and balanced food that suits the life stage (puppy, adult or senior) and the size of the dog is the base of a good diet.",
    foodNote: "Pick a formula for the right size of dog and check the pack's feeding guide.",
    trainAbout: "Dogs learn best from short, happy, reward-based sessions. A few minutes several times a day beats one long session.",
    trainTip: "If the session goes badly, make the next one easier and end on something that works.",
    carNote: "Most dogs travel best after a walk and a toilet break.",
    waterNote: "Dogs drink more in hot weather, after exercise and when eating dry food.",
    routineNote: "Adjust the walks to age, size and health.",
    concerns: [
      I("Dental disease", "Tartar and gum problems are very common. Brush teeth often and ask the vet to check them.", "tooth-outline"),
      I("Obesity", "Extra weight strains joints and the heart. Measure meals and keep treats small.", "scale-bathroom"),
      I("Skin and ear infections", "Itching, redness, smell or head shaking need a vet check.", "ear-hearing"),
      I("Parasites", "Fleas, ticks and worms need regular prevention. Ask the vet for a plan.", "bug-outline"),
    ],
  },
  cat: {
    label: "cat", exercise: "20 – 30 minutes of play", brush: "Weekly", bathEvery: "Rarely: most cats clean themselves",
    bathNote: "A cat that cannot groom well (very old, overweight or with a long coat) may need help.",
    earFreq: "Check weekly, clean only when dirty", earNote: "Healthy cat ears are clean, pale pink and almost odour free.",
    foodAbout: "Cats are obligate carnivores, so they need meat-based food with enough protein and taurine. Wet food also adds useful water.",
    foodNote: "Choose a food made for the cat's life stage and check the pack's feeding guide.",
    trainAbout: "Cats can learn names, come-when-called, using a carrier and accepting handling. They respond to treats, never to punishment.",
    trainTip: "Train when the cat is a little hungry and keep every session under five minutes.",
    carNote: "Most cats feel safest in a covered carrier that they already know.",
    waterNote: "Cats often drink little. Wet food and a water fountain can help.",
    routineNote: "Cats like predictable meal and play times.",
    concerns: [
      I("Dental disease", "Bad breath, drooling or dropping food can mean sore teeth.", "tooth-outline"),
      I("Obesity", "Indoor cats gain weight easily. Measure meals and play daily.", "scale-bathroom"),
      I("Urinary problems", "Straining, frequent trips to the litter box or blood in urine need a vet quickly.", "toilet"),
      I("Parasites", "Fleas, ticks and worms need regular prevention. Ask the vet for a plan.", "bug-outline"),
    ],
  },
  rabbit: {
    label: "rabbit", exercise: "3 – 4 hours out of the pen", brush: "Weekly", bathEvery: "Never: spot-clean only",
    bathNote: "A full bath can cause shock and chilling in rabbits.",
    earFreq: "Check weekly", earNote: "Healthy rabbit ears are clean inside with little wax and no crusts.",
    foodAbout: "Grass hay should make up most of a rabbit's diet, with leafy greens and a small portion of pellets. Hay keeps teeth worn down and the gut moving.",
    foodNote: "Introduce any new food slowly, one at a time.",
    trainAbout: "Rabbits can learn litter habits, their name, a nose-touch and calm handling. They need patience and a lot of small rewards.",
    trainTip: "Sit on the floor and let the rabbit come to you. Never chase or pick up a rabbit that is hiding.",
    carNote: "A secure carrier with a non-slip towel and some hay is the safest way to travel.",
    waterNote: "Many rabbits drink more from a heavy bowl than from a bottle.",
    routineNote: "Rabbits are most active at dawn and dusk.",
    concerns: [
      I("Dental problems", "Teeth never stop growing. Drooling, dropped food or weight loss need a vet.", "tooth-outline"),
      I("Gut stasis", "No droppings or no eating for 8 – 12 hours is an emergency.", "stomach"),
      I("Respiratory infections", "Sneezing, a runny nose or noisy breathing need a vet check.", "alert-outline"),
      I("Obesity", "Too many pellets and treats cause weight gain and sore feet.", "scale-bathroom"),
    ],
  },
};

const BREED_DATA = {
  dog: {
    "hungarian-vizsla": {
      label: "Hungarian Vizsla", exercise: "90 minutes or more", brush: "Weekly with a rubber mitt", bathEvery: "Every 6 – 8 weeks, or when muddy",
      bathNote: "The short single coat has no thick undercoat, so it dries quickly but loses heat quickly too.",
      earFreq: "Check weekly, clean every 2 weeks", earNote: "Long, hanging ears cover the ear canal, so moisture and dirt stay in. Lift the flap and look every week.",
      foodAbout: "A lean, athletic Vizsla needs a high-quality, protein-rich food for active dogs, split into 2 meals.",
      foodNote: "Keep the body lean: ribs should be easy to feel under a thin layer of flesh. Rest for an hour around hard exercise.",
      trainAbout: "Vizslas are eager and sensitive and want to work with their person. They respond best to calm, reward-based training and quickly get bored with repetition.",
      trainTip: "A Vizsla without a job finds its own. Add scent games, retrieving and short training bursts to every walk.",
      carNote: "Vizslas stick close to their people and can be anxious when left alone, so never leave one in a parked car. Exercise before a long drive to help them settle.",
      waterNote: "A Vizsla that exercises hard needs water often and cool shade in hot weather.",
      routineNote: "A Vizsla needs two proper exercise sessions plus brain games, and a warm, cosy place to rest because the thin coat feels the cold.",
      concerns: [
        I("Hip dysplasia", "A joint problem that causes stiffness or limping. Keep a lean weight and avoid hard jumping while growing.", "bone"),
        I("Epilepsy", "Some Vizslas have seizures. Note the time and length and see the vet.", "alert-circle-outline"),
        I("Hypothyroidism", "Low thyroid hormone can cause weight gain, a dull coat and tiredness. A blood test confirms it.", "heart-pulse"),
        I("Separation anxiety", "Howling, chewing or toilet accidents when left alone. Teach calm alone time in small steps.", "home-alert-outline"),
      ],
    },
    "border-collie": {
      label: "Border Collie", exercise: "90 – 120 minutes plus brain games", brush: "2 – 3 times a week", bathEvery: "Every 6 – 8 weeks, or when muddy",
      bathNote: "The medium-length feathered coat picks up burrs and mud. Brush first, then wash.",
      earFreq: "Check weekly, clean every 3 – 4 weeks", earNote: "The semi-erect ears get more air than floppy ears, but dirt and grass seeds can still get in after outdoor work.",
      foodAbout: "A Border Collie that works or exercises hard needs an active-dog food rich in protein, in 2 meals.",
      foodNote: "Active collies burn many calories, but weight can creep up when the exercise drops. Adjust meals with the season.",
      trainAbout: "Border Collies are among the fastest learners and love having a job. They can also invent bad jobs, like chasing cars, children or shadows.",
      trainTip: "Teach a solid 'leave it' and 'settle'. Pair running with thinking games: puzzle feeders, scent work and new tricks.",
      carNote: "Many Border Collies watch every moving thing, which can make car rides tiring. A covered crate or window shades help. Check noise sensitivity before long trips.",
      waterNote: "A Border Collie working hard needs frequent water breaks, especially in warm weather.",
      routineNote: "A Border Collie needs long exercise and daily mental work. Without both, it may herd people or chew furniture.",
      concerns: [
        I("Hip dysplasia", "A joint problem that causes stiffness or limping. Keep a healthy weight and avoid overdoing jumps.", "bone"),
        I("Collie eye anomaly", "An inherited eye condition. Your vet can check the eyes, and breeders often test for it.", "eye-outline"),
        I("Epilepsy", "Seizures can occur in some lines. Note the time and length, and see the vet.", "alert-circle-outline"),
        I("Noise anxiety", "Fireworks and thunder can scare many collies. Prepare a quiet, den-like space.", "volume-off"),
      ],
    },
    "japanese-akita": {
      label: "Japanese Akita", exercise: "45 – 60 minutes", brush: "2 – 3 times a week, daily during seasonal shedding", bathEvery: "Every 6 – 8 weeks",
      bathNote: "The thick double coat holds water. Rinse until the water runs clear and dry down to the skin, or hot spots can follow. Never shave the coat.",
      earFreq: "Check every 2 weeks, clean when dirty", earNote: "Erect ears get good airflow, but check after baths and swims for moisture and dirt.",
      foodAbout: "A large breed like the Akita does best on a large-breed food. Feed 2 meals a day instead of 1 big meal.",
      foodNote: "Akitas can be prone to bloat. Avoid hard exercise for about an hour before and after meals, and do not let the dog gulp down food or water.",
      trainAbout: "Akitas are dignified, independent and reserved with strangers. They respond to calm, fair, reward-based training, and early socialisation is very important.",
      trainTip: "Start socialisation with people and well-mannered dogs early, and keep first meetings calm. Akitas can be dominant with other dogs.",
      carNote: "Akitas are large and heat-sensitive. Use air conditioning, shade and water, and a harness or crate sized for a large dog. Never leave an Akita in a parked car.",
      waterNote: "A thick double coat makes Akitas feel the heat quickly. Offer cool water and shade, and avoid midday exercise.",
      routineNote: "An Akita is calmer than many working breeds but still needs a daily walk, mental games and cool rest in hot weather.",
      concerns: [
        I("Hip dysplasia", "A joint problem that causes stiffness or limping. Keep a lean weight, especially while growing.", "bone"),
        I("Autoimmune disease", "Some Akitas develop skin, eye or thyroid conditions. Ask the vet about changes in coat, skin or eyes.", "shield-alert-outline"),
        I("Hypothyroidism", "Low thyroid hormone can cause weight gain, a dull coat and tiredness. A blood test confirms it.", "heart-pulse"),
        I("Bloat (GDV)", "A swollen, hard belly with retching is an emergency. Go to a vet straight away.", "alert-circle-outline"),
      ],
    },
  },
  cat: {
    persian: {
      label: "Persian", exercise: "15 – 20 minutes, twice a day", brush: "Daily, with a wide-toothed comb", bathEvery: "Every 4 – 6 weeks if the coat gets oily",
      bathNote: "The long, dense coat can get oily and matted. Many Persian owners use a groomer. Comb out every tangle before the bath.",
      earFreq: "Check weekly", earNote: "Persian ears are small and usually clean, but thick fur around them can trap dirt. Dark crumbly debris can mean ear mites.",
      foodAbout: "Persians need a meat-based food in a shallow dish or a kibble shaped for flat faces, because the short nose makes picking up round kibble hard.",
      foodNote: "Persians are calm and can gain weight. Measure meals and keep treats small. Wipe the face after meals to avoid skin irritation.",
      trainAbout: "Persians are gentle and quiet. They learn to come to their name, use the litter box, and accept combing and handling if you start early with treats.",
      trainTip: "Practise short, positive grooming sessions every day. A cat that accepts the comb will save you stressful visits to the groomer.",
      carNote: "Persians have flat faces and overheat easily. Keep the car cool, use a well-ventilated carrier and never leave the cat in a parked car.",
      waterNote: "Persians can drink little. Wet food and a water fountain help, and a wide bowl keeps whiskers comfortable.",
      routineNote: "Persians are calm and love quiet routines. Plan daily combing, face wiping and short play sessions.",
      concerns: [
        I("Polycystic kidney disease", "An inherited condition where cysts form in the kidneys. Ask your vet about screening.", "heart-pulse"),
        I("Breathing and eye problems", "A flat face can cause noisy breathing and watery eyes. Wipe the eyes daily and ask the vet about changes.", "eye-outline"),
        I("Dental crowding", "A short jaw can crowd the teeth. Brush the teeth and ask the vet for regular checks.", "tooth-outline"),
        I("Matted coat", "Mats pull on the skin and hide problems. Comb every day.", "brush"),
      ],
    },
    himalayan: {
      label: "Himalayan", exercise: "15 – 20 minutes, twice a day", brush: "Daily, with a wide-toothed comb", bathEvery: "Every 4 – 6 weeks if the coat gets oily",
      bathNote: "The long coat mats easily and can get oily. Comb out every tangle first, and rinse until no shampoo is left.",
      earFreq: "Check weekly", earNote: "Himalayan ears are small and usually clean, but dense fur around them can trap dirt. Dark crumbly debris can mean ear mites.",
      foodAbout: "Himalayans do best on a meat-based food in a shallow dish or flat-face kibble, because the short nose makes picking up food hard.",
      foodNote: "Himalayans are calm and can gain weight. Measure meals, keep treats small and wipe the face after eating.",
      trainAbout: "Himalayans are sweet and gentle. They learn to come to their name, use the litter box and accept grooming if you start early with treats.",
      trainTip: "Short, positive grooming sessions every day make life easier for a cat with a long coat.",
      carNote: "Himalayans have flat faces and overheat easily. Keep the car cool, use a ventilated carrier and never leave the cat in a parked car.",
      waterNote: "Himalayans can drink little. Wet food and a water fountain help, and a wide bowl is more comfortable for a flat face.",
      routineNote: "Himalayans are calm and love quiet routines. Plan daily combing, face cleaning and short play sessions.",
      concerns: [
        I("Polycystic kidney disease", "An inherited condition where cysts form in the kidneys. Ask your vet about screening.", "heart-pulse"),
        I("Breathing and eye problems", "A flat face can cause noisy breathing and watery eyes. Wipe the eyes daily and ask the vet about changes.", "eye-outline"),
        I("Dental crowding", "A short jaw can crowd the teeth. Brush the teeth and ask the vet for regular checks.", "tooth-outline"),
        I("Matted coat", "Mats pull on the skin and hide problems. Comb every day.", "brush"),
      ],
    },
  },
  rabbit: {
    "holland-lop": {
      label: "Holland Lop", exercise: "3 – 4 hours out of the pen", brush: "Weekly, daily when moulting", bathEvery: "Never: spot-clean only",
      bathNote: "A full bath can cause shock. Use a slightly damp cloth for small spots and dry the fur well.",
      earFreq: "Check every week", earNote: "Lop ears fold over the ear canal, so there is less airflow and more wax. Look inside weekly and never push anything into the canal.",
      foodAbout: "A small rabbit like the Holland Lop needs unlimited grass hay, a handful of leafy greens and only a small portion of pellets.",
      foodNote: "Holland Lops are small and gain weight easily. Measure pellets, keep fruit as a rare treat, and watch teeth for overgrowth.",
      trainAbout: "Holland Lops are friendly, playful and curious. They learn litter habits, their name and simple tricks with small treats.",
      trainTip: "Use a tiny piece of herb or leaf as a reward. Keep sessions short and let the rabbit set the pace.",
      carNote: "Holland Lops are small, so a snug, well-ventilated carrier with a non-slip towel works well. Keep the car cool and never leave the rabbit in a parked car.",
      waterNote: "A small rabbit still needs fresh water every day. Use a heavy ceramic bowl and wash it daily.",
      routineNote: "Holland Lops love to play. Plan free-roam time, hay all day and daily ear and teeth checks.",
      concerns: [
        I("Dental problems", "Teeth never stop growing. Unlimited hay keeps them worn. Drooling or dropped food needs a vet.", "tooth-outline"),
        I("Ear infections", "Lop ears hold wax and moisture. Head shaking, smell or discharge needs a vet.", "ear-hearing"),
        I("Gut stasis", "No droppings or no eating for 8 – 12 hours is an emergency.", "stomach"),
        I("Obesity", "Too many pellets and treats cause weight gain. Measure food and give hay freely.", "scale-bathroom"),
      ],
    },
    "newzealand-bunny": {
      label: "New Zealand rabbit", exercise: "3 – 4 hours with room to run", brush: "Weekly, more often when moulting", bathEvery: "Never: spot-clean only",
      bathNote: "A full bath can cause shock. Use a damp cloth for spots, and keep the feet and bottom clean and dry.",
      earFreq: "Check every week", earNote: "Upright ears get good airflow, but look inside weekly for wax, crusts or mites. Never push anything into the canal.",
      foodAbout: "A large rabbit like the New Zealand needs a lot of fresh grass hay every day, leafy greens and a measured portion of pellets.",
      foodNote: "Large rabbits eat a lot, but extra weight puts pressure on the feet. Measure pellets and offer hay freely.",
      trainAbout: "New Zealand rabbits are docile and calm. They learn litter habits, their name and a nose-touch, and usually enjoy handling when it is gentle.",
      trainTip: "Support the whole body with both hands when lifting. A large rabbit that feels unsafe may kick.",
      carNote: "A New Zealand is a large rabbit, so choose a roomy carrier with a non-slip floor. Keep the car cool and never leave the rabbit in a parked car.",
      waterNote: "A large rabbit drinks a lot. Use a heavy bowl and refill it at least once a day.",
      routineNote: "A New Zealand needs plenty of space to hop. Plan long free-roam time, soft flooring and daily foot checks.",
      concerns: [
        I("Sore hocks", "Red or sore skin under the back feet from hard or wire floors. Use soft, solid flooring and keep the cage clean.", "paw"),
        I("Obesity", "Extra weight is hard on the feet and heart. Measure pellets and give hay freely.", "scale-bathroom"),
        I("Gut stasis", "No droppings or no eating for 8 – 12 hours is an emergency.", "stomach"),
        I("Dental problems", "Teeth never stop growing. Unlimited hay keeps them worn. Drooling or dropped food needs a vet.", "tooth-outline"),
      ],
    },
  },
};

/* ------------------------------------------------------------------ pages */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const names = (d) => d.concerns.map((c) => c.title.toLowerCase()).join(", ");

const PAGES = {
  daily_routine(sp, d) {
    const out = [];
    if (sp === "dog") {
      out.push(about("Create a daily schedule", `Dogs feel safest when they know what comes next. A steady routine for meals, walks, play and rest reduces anxiety and makes training easier for ${PN}. ${d.routineNote}`, [
        F("Meals", "2 a day, same time", "food-variant"), F("Exercise", d.exercise, "walk"), F("Water", "Always fresh", "cup-water"), F("Sleep", "12 – 14 hours", "sleep"),
      ]));
      out.push(timeline("A sample day", [
        T("7:00 AM", "Wake up", "Potty break and fresh water."),
        T("7:30 AM", "Breakfast", "Followed by a calm rest."),
        T("8:30 AM", "Morning walk", "Part of the daily exercise, with time to sniff."),
        T("12:00 PM", "Potty & play", "A short game or training session."),
        T("3:00 PM", "Rest & brain games", "A chew toy or puzzle feeder."),
        T("5:30 PM", "Evening walk or fetch", "Burn off the day's energy."),
        T("7:00 PM", "Dinner", "The second meal of the day."),
        T("9:30 PM", "Last potty, then bed", "Wind down with cuddles or brushing."),
      ]));
    } else if (sp === "cat") {
      out.push(about("Create a daily schedule", `Cats love predictability. Regular meals, play and a clean litter box keep ${PN} calm and confident. ${d.routineNote}`, [
        F("Meals", "2 – 3 a day", "food-variant"), F("Play", d.exercise, "tennis-ball"), F("Water", "Fresh, in several spots", "cup-water"), F("Sleep", "12 – 16 hours", "sleep"),
      ]));
      out.push(timeline("A sample day", [
        T("7:00 AM", "Breakfast", "Plus fresh water."),
        T("7:30 AM", "Litter box", "Scoop at least once a day."),
        T("10:00 AM", "Window time", "A perch with a view is great enrichment."),
        T("1:00 PM", "Short play", "Use a wand toy and let the cat 'catch' it at the end."),
        T("6:00 PM", "Dinner", "Measured, at the same time every day."),
        T("8:00 PM", "Play & cuddles", "A longer session before the evening rest."),
      ]));
    } else {
      out.push(about("Create a daily schedule", `Rabbits are most active at dawn and dusk. A routine of fresh hay, greens and safe exercise keeps ${PN} healthy. ${d.routineNote}`, [
        F("Hay", "Unlimited, always fresh", "grass"), F("Pellets", "A small measured portion", "food-variant"), F("Exercise", d.exercise, "run"), F("Water", "Fresh, in a heavy bowl", "cup-water"),
      ]));
      out.push(timeline("A sample day", [
        T("7:00 AM", "Fresh hay & water", "Refill the hay rack and wash the water bowl."),
        T("7:30 AM", "Pellets & greens", "A small measured portion plus leafy greens."),
        T("9:00 AM", "Free-roam time", "In a rabbit-proofed area."),
        T("1:00 PM", "Quiet rest", "Rabbits nap in short bursts."),
        T("6:00 PM", "Greens & playtime", "Tunnels, cardboard boxes and chew toys."),
        T("8:00 PM", "Evening roam & check", "Look at eyes, nose, teeth, bottom and droppings."),
      ]));
    }
    out.push(list("Daily care checklist", [
      I("Fresh water", "Clean the bowl and refill daily.", "cup-water"),
      I("Measured meals", "Feed at set times and measure portions.", "food-variant"),
      I(sp === "cat" ? "Play" : "Exercise", `Aim for ${d.exercise} a day.`, "run"),
      I("Quick body check", "Eyes, ears, paws, skin and appetite.", "magnify"),
      I("Cuddle time", "Undivided attention matters just as much.", "heart-outline"),
    ]));
    out.push(tip("Make it a habit 📅", `Add ${PN}'s meals, play and medicines as tasks and let reminders keep the routine going, even on busy days.`, { label: "Create a task", route: "/CreateTaskScreen" }));
    return out;
  },

  hydration(sp, d) {
    const rate = { dog: "about 50 – 60 ml per kg", cat: "about 40 – 60 ml per kg", rabbit: "about 50 – 150 ml per kg" }[sp];
    return [
      about("Water intake guide", `Water supports digestion, temperature control and kidney health. A typical ${d.label === "dog" || d.label === "cat" || d.label === "rabbit" ? d.label : `${d.label}`} needs ${rate} of body weight a day, and more when it is hot, when active or when eating dry food. ${d.waterNote}`, [
        F("Rule of thumb", rate, "scale-bathroom"), F("Drinks more when", "Hot or very active", "weather-sunny"), F("Bowl", "Washed and refilled daily", "cup-water"), F("Outdoors", sp === "dog" ? "Carry water" : "Fresh water at home", "walk"),
      ]),
      list(`Keep ${PN} hydrated`, [
        I("Water in more than one spot", "Make it easy to find at home.", OK),
        I(sp === "cat" ? "Try a fountain" : "Use a clean bowl", sp === "cat" ? "Many cats prefer moving water. Wet food adds water too." : sp === "rabbit" ? "A heavy ceramic bowl is easier to drink from than a bottle." : "Stainless steel or ceramic bowls are easy to keep clean.", OK),
        I("Add water to meals", sp === "rabbit" ? "Wet leafy greens add a little water to the diet." : "A little water or wet food mixed into dry food helps.", OK),
        I(sp === "dog" ? "Take water on walks" : "Log it", sp === "dog" ? "Offer a drink during and after exercise." : "Use the water tracker to see how close you are to the daily goal.", OK),
      ]),
      list("Signs of dehydration", [
        I("Dry, sticky gums", "They should feel moist.", WARN),
        I("Loss of skin elasticity", "Gently lifted skin should snap back quickly.", WARN),
        I("Sunken eyes & tiredness", "Weak or low on energy.", WARN),
        I("Thick saliva or heavy panting", "Especially after rest.", WARN),
      ], { tone: "danger" }),
      tip("Watch out for sudden changes 💧", "Drinking much more or much less than usual can be a sign of illness, such as diabetes or kidney problems. Tell your vet if you notice a change.", { label: "Open Water tracker", route: "/WaterScreen" }),
    ];
  },

  vaccination_guide(sp, d) {
    const checkup = tip(`${PN}'s next vaccine 💉`, `Add vaccines as health records and set a reminder so a dose is never missed. Yearly check-ups are also a good time to ask the vet about ${names(d)}.`, { label: "Open Health Records", route: "/HealthRecordScreen" });
    if (sp === "dog") {
      return [
        about("Why vaccines matter", `Vaccines protect ${PN} from serious and sometimes deadly diseases. Puppies need a series of shots, and adult dogs need boosters to keep their protection strong.`, [
          F("Core vaccines", "DHPP & Rabies", "needle"), F("Puppy series", "6 – 16 weeks", "shield-check-outline"), F("Boosters", "Every 1 – 3 years", "calendar-check-outline"), F("Records", "Keep the card handy", "clipboard-check-outline"),
        ]),
        timeline("Typical vaccination schedule", [
          T("6 – 8 weeks", "DHPP (1st dose)", "Protects against distemper, hepatitis, parvovirus and parainfluenza."),
          T("10 – 12 weeks", "DHPP (2nd dose)", "Optional vaccines such as Leptospirosis or Bordetella can start here."),
          T("14 – 16 weeks", "DHPP (3rd dose) + Rabies", "Rabies is given from about 12 weeks, as per local law."),
          T("12 – 16 months", "First boosters", "DHPP and Rabies boosters complete the puppy course."),
          T("Adult", "Regular boosters", "DHPP every 1 – 3 years as your vet advises. Rabies as per local rules, often yearly."),
        ], `Your vet may adjust this based on ${PN}'s health and where you live.`),
        list("Core vs optional", [
          I("DHPP (core)", "Distemper, Hepatitis, Parvovirus and Parainfluenza. Recommended for every dog.", "shield-check-outline"),
          I("Rabies (core)", "Protects your dog and your family, and is legally required in many places.", "shield-check-outline"),
          I("Bordetella (optional)", "Helps prevent kennel cough. Useful for groomers, daycare or boarding.", "needle"),
          I("Leptospirosis (optional)", "Spread through contaminated water and rodents. Worth asking about in rainy seasons.", "needle"),
        ]),
        list("After the vaccine", [
          I("Normal", "Slight tiredness, lower appetite or a small tender lump where the shot was given.", OK),
          I("Call your vet if you see", "Facial swelling, hives, repeated vomiting, difficulty breathing or collapse. These are rare but need quick care.", WARN),
        ], { tone: "warn", intro: "Most dogs feel fine. Mild side effects usually pass within a day or two." }),
        checkup,
      ];
    }
    if (sp === "cat") {
      return [
        about("Why vaccines matter", `Vaccines protect ${PN} from serious cat diseases like cat flu and panleukopenia. Kittens need a series of shots, and adult cats need boosters.`, [
          F("Core vaccines", "FVRCP & Rabies", "needle"), F("Kitten series", "6 – 16 weeks", "shield-check-outline"), F("Boosters", "Every 1 – 3 years", "calendar-check-outline"), F("Records", "Keep the card handy", "clipboard-check-outline"),
        ]),
        timeline("Typical vaccination schedule", [
          T("6 – 8 weeks", "FVRCP (1st dose)", "Protects against cat flu viruses and panleukopenia."),
          T("10 – 12 weeks", "FVRCP (2nd dose)", "Boosters continue every 3 – 4 weeks until about 16 weeks."),
          T("12+ weeks", "Rabies", "Given from about 12 weeks, as per local law."),
          T("1 year", "First boosters", "FVRCP and Rabies boosters complete the kitten course."),
          T("Adult", "Regular boosters", "Every 1 – 3 years as your vet advises."),
        ], `Your vet may adjust this based on ${PN}'s health and lifestyle.`),
        list("Core vs optional", [
          I("FVRCP (core)", "Cat flu viruses and panleukopenia. Recommended for every cat.", "shield-check-outline"),
          I("Rabies (core)", "Protects your cat and your family, and is legally required in many places.", "shield-check-outline"),
          I("FeLV (optional)", "Feline leukaemia. Often advised for cats that go outdoors or live with other cats.", "needle"),
        ]),
        list("After the vaccine", [
          I("Normal", "Slight tiredness, lower appetite or a small tender lump where the shot was given.", OK),
          I("Call your vet if you see", "Facial swelling, hives, repeated vomiting, difficulty breathing or a lump that grows or stays for weeks.", WARN),
        ], { tone: "warn", intro: "Most cats feel fine. Mild side effects usually pass within a day or two." }),
        checkup,
      ];
    }
    return [
      about("Why vaccines matter", `Some rabbit diseases spread quickly and can be deadly. Vaccines, where available, are one of the best protections for ${PN}. Rabbits do not usually get the dog and cat vaccines.`, [
        F("Main diseases", "Myxomatosis & RHD", "needle"), F("Availability", "Varies by country", "map-marker-outline"), F("Boosters", "Usually every year", "calendar-check-outline"), F("Records", "Keep the card handy", "clipboard-check-outline"),
      ]),
      timeline("Typical vaccination plan", [
        T("From ~5 weeks", "Myxomatosis & RHD", "The age and number of doses depend on the vaccine. Ask an exotic-pet vet."),
        T("Every year", "Booster", "Yearly boosters are common. Your vet will confirm the schedule."),
        T("Every year", "Health check", "Include teeth, weight, ears and gut health."),
      ], "Vaccines for rabbits differ between countries, and some are not available everywhere. Ask a vet who treats rabbits."),
      list("Protect your rabbit too", [
        I("Control insects", "Fleas and mosquitoes can spread myxomatosis. Keep the home and hutch clean and use vet-approved prevention.", "bug-outline"),
        I("Keep new rabbits apart", "Quarantine a new rabbit and wash your hands between pets.", "hand-wash-outline"),
        I("Wash greens and hay", "Do not collect grass or greens from places where wild rabbits live.", "leaf"),
      ], { tone: "warn" }),
      checkup,
    ];
  },

  ear_cleaning(sp, d) {
    const headline = sp === "rabbit" ? "Looking after rabbit ears" : sp === "cat" ? "Keeping cat ears clean" : "Clean ears safely";
    const out = [about(headline, `${d.earNote} ${PN} will thank you for a quick weekly check.`, [
      F("Check", cap(d.earFreq.split(",")[0].replace(/^Check\s+/i, "")), "magnify"), F("Clean", sp === "dog" ? cap((d.earFreq.split(",")[1] || "when dirty").trim().replace(/^clean\s+/i, "")) : "Only when dirty", "calendar-check-outline"),
      F("Use", sp === "rabbit" ? "A dry, soft cloth outside" : "Vet-approved cleaner", "bottle-tonic-outline"), F("Never", "Cotton buds deep inside", "close-circle-outline"),
    ])];
    if (sp === "dog") {
      out.push(timeline("How to clean", [
        T("Step 1", "Have a look first", "Healthy ears are light pink with little or no smell."),
        T("Step 2", "Fill the canal", "Hold the ear flap up and squeeze in enough cleaner to fill the canal."),
        T("Step 3", "Massage the base", "Rub the base of the ear for 20 – 30 seconds. You should hear a squishing sound."),
        T("Step 4", "Let the dog shake", "Step back. Shaking brings the loosened dirt up."),
        T("Step 5", "Wipe and reward", "Wipe the visible part of the ear with cotton or gauze, dry it and give a treat."),
      ]));
    } else if (sp === "cat") {
      out.push(timeline("How to clean (only when dirty)", [
        T("Step 1", "Look first", "A little pale wax is normal. Do not clean clean ears."),
        T("Step 2", "Wet a cotton pad", "Use a vet-approved ear cleaner, not water or oils."),
        T("Step 3", "Wipe the visible part", "Wipe gently only where you can see. Never push into the canal."),
        T("Step 4", "Reward", "A treat and a cuddle make the next check easier."),
      ]));
    } else {
      out.push(timeline("What to do", [
        T("Step 1", "Look inside", "Look for wax, crusts, redness or any smell."),
        T("Step 2", "Wipe the outer ear", "Use a dry, soft cloth or a very slightly damp one. Do not put liquid in the ear."),
        T("Step 3", "Do not use drops", "Rabbit ears are delicate. Only use ear drops a vet has prescribed."),
        T("Step 4", "Call the vet", "Crusty, thick debris or a head tilt needs a vet quickly."),
      ]));
    }
    out.push(list("See your vet if you notice", [
      I("Strong smell", "A sour or yeasty odour often means infection.", WARN),
      I("Redness or swelling", "The ear flap or canal looks inflamed.", WARN),
      I("Dark or yellow discharge", sp === "cat" ? "Dark crumbly debris can mean ear mites." : "Brown, black or pus-like debris.", WARN),
      I("Head shaking or scratching", "Especially with head tilt or whining.", WARN),
      I("Pain when touched", "Pulling away or crying when the ear is touched.", WARN),
    ], { tone: "danger" }));
    out.push(tip(sp === "dog" ? "After water play 💡" : "Keep it dry 💡", sp === "dog" ? `Dry ${PN}'s ears gently after baths and swimming. Moisture left behind is the most common cause of infections.` : `Keep ${PN}'s ears dry and the sleeping area clean. Moisture and dirt can lead to infections.`));
    return out;
  },

  best_food_types(sp, d) {
    const label = sp === "dog" ? "What to feed" : sp === "cat" ? "What a cat eats" : "What a rabbit eats";
    const options = {
      dog: [
        I("Dry kibble", "Convenient, affordable and good for teeth. Pick a formula for the right life stage and size.", "bowl-mix-outline"),
        I("Wet / canned food", "Tasty and high in moisture. Great as a topper for picky eaters, but costlier.", "food-variant"),
        I("Home-cooked meals", "Only with a recipe balanced by your vet or a pet nutritionist. Home recipes often miss key nutrients.", "pot-steam-outline"),
        I("Raw diets", "Carry a risk of bacteria for pets and family. Talk to your vet before trying one.", "alert-outline"),
      ],
      cat: [
        I("Wet food", "High in moisture and protein. Good for hydration and the urinary tract.", "food-variant"),
        I("Dry kibble", "Convenient and good for budgets. Offer plenty of water with it.", "bowl-mix-outline"),
        I("A mix of both", "Many cats do best with wet food for meals and a small amount of dry.", "food-variant"),
        I("Home-cooked or raw", "Cats need nutrients like taurine. Only use a recipe balanced by a vet or pet nutritionist.", "alert-outline"),
      ],
      rabbit: [
        I("Grass hay (80 – 90%)", "Timothy, orchard or meadow hay. Unlimited, always fresh.", "grass"),
        I("Leafy greens", "A variety every day: coriander, romaine, rocket and more. Introduce each one slowly.", "leaf"),
        I("Pellets", "A small measured portion of plain, high-fibre pellets. Skip mixes with seeds and colourful bits.", "food-variant"),
        I("Treats", "Small pieces of fruit now and then. Not too often.", "fruit-cherries"),
      ],
    }[sp];
    return [
      about(`${label}${sp === "dog" ? ` ${PN}` : ""}`, `${d.foodAbout} ${d.foodNote}`, [
        F("Protein", sp === "rabbit" ? "From hay and greens" : "Real meat first", "food-drumstick-outline"),
        F("Water", "Always fresh", "cup-water"),
        F("Meals", sp === "rabbit" ? "Hay all day" : sp === "cat" ? "2 – 3 small meals" : "2 a day", "clock-outline"),
        F("Treats", sp === "rabbit" ? "Rarely" : "Under 10% of food", "cookie-outline"),
      ]),
      list("Food options", options),
      list("What to check on the label", sp === "rabbit"
        ? [
          I("High fibre", "Look for a high fibre, low protein pellet based on grass hay.", OK),
          I("No seeds, nuts or dyes", "Mixes with seeds and coloured bits encourage selective eating.", OK),
          I("Fresh", "Use pellets within a few months of opening.", OK),
        ]
        : [
          I("\"Complete and balanced\"", "The pack should say it suits the pet's life stage.", OK),
          I("Named protein first", "Chicken, fish or lamb rather than vague \"meat\" or \"by-products\".", OK),
          I(sp === "dog" ? "Size-matched formula" : "Made for cats", sp === "dog" ? "Matches the dog's size, so calcium and calories are right." : "Cat food has taurine, which cats cannot make enough of.", OK),
          I("No artificial colours", "Dyes and heavy sugar add nothing for pets.", OK),
        ]),
      tip("Switching foods? Go slow 💡", `Mix the new food into the old over 7 – 10 days: start with about 25% new and increase every 2 – 3 days. A sudden change can upset ${PN}'s tummy.`, { label: "Open food tracker", route: "/FoodScreen" }),
    ];
  },

  bathing(sp, d) {
    if (sp === "rabbit") {
      return [
        about("Keeping a rabbit clean", `Rabbits groom themselves and should not be given a full bath. Water can cause shock and chilling. ${d.bathNote}`, [
          F("Full bath", "Never", "close-circle-outline"), F("Spot clean", "Damp cloth, then dry", "water-outline"), F("Brushing", d.brush, "brush"), F("Dirty bottom?", "See a vet", "stethoscope"),
        ]),
        timeline("If a spot is dirty", [
          T("Step 1", "Brush first", "Brush off loose dirt and fur."),
          T("Step 2", "Use a damp cloth", "Wipe only the dirty spot. Keep the rabbit warm and calm."),
          T("Step 3", "Dry well", "Pat dry with a soft towel. Never leave fur wet."),
          T("Step 4", "Look for the cause", "A dirty bottom or wet chin may mean teeth, diet or bladder problems."),
        ]),
        list("Avoid", [
          I("Full baths", "They can cause stress, chills and shock.", WARN),
          I("Hair dryers", "Heat and noise can frighten rabbits.", WARN),
          I("Human shampoo", "It irritates rabbit skin.", WARN),
        ], { tone: "warn" }),
        tip("Wet bottom? 💡", `A dirty or urine-stained bottom is a health sign for ${PN}. Ask the vet about diet, weight, teeth and joints.`),
      ];
    }
    if (sp === "cat") {
      return [
        about("Tips for a bath", `Most cats rarely need a bath because they clean themselves. ${d.bathNote}`, [
          F("How often", d.bathEvery, "calendar-check-outline"), F("Water", "Lukewarm", "water-outline"), F("Shampoo", "Cat-specific only", "bottle-tonic-outline"), F("Drying", "Thorough and warm", "hair-dryer-outline"),
        ]),
        timeline("Bath steps", [
          T("Step 1", "Brush or comb first", "Remove tangles and loose fur. Mats tighten when wet."),
          T("Step 2", "Trim nails and prepare", "Use a non-slip mat, and keep towels and treats ready."),
          T("Step 3", "Wet gently", "Use lukewarm water from the neck down. Keep it away from the eyes and ears."),
          T("Step 4", "Lather and rinse", "Use cat shampoo and rinse well. Leftover soap can cause itching."),
          T("Step 5", "Dry completely", "Towel dry and keep the cat in a warm room until fully dry."),
        ]),
        list("Avoid", [
          I("Human or dog shampoo", "These can irritate cat skin.", WARN),
          I("Hot water", "It can scald the skin.", WARN),
          I("Forcing a stressed cat", "Stop and try again later, or ask a groomer.", WARN),
        ], { tone: "warn" }),
        tip("Prefer a groomer? 💡", `If ${PN} gets very stressed, a professional cat groomer or a vet can help.`),
      ];
    }
    return [
      about("Tips for a good bath", `${d.bathNote}`, [
        F("How often", d.bathEvery, "calendar-check-outline"), F("Water", "Lukewarm", "water-outline"), F("Shampoo", "Dog-specific only", "bottle-tonic-outline"), F("Drying", "Thorough, to the skin", "hair-dryer-outline"),
      ]),
      timeline("Bath steps", [
        T("Step 1", "Brush first", "Mats tighten when wet, so remove tangles and loose fur before the bath."),
        T("Step 2", "Set up safely", "Use a non-slip mat and have shampoo, towels and treats within reach."),
        T("Step 3", "Wet the coat", "Use lukewarm water from the neck down. Keep water away from ears and eyes."),
        T("Step 4", "Lather gently", "Massage in dog shampoo, working through the coat to the skin."),
        T("Step 5", "Rinse really well", "Leftover shampoo causes itching and dryness. Keep rinsing until the water runs clear."),
        T("Step 6", "Dry completely", "Towel dry, then use a blow dryer on cool or low. A damp coat can lead to hot spots."),
      ]),
      list("Avoid", [
        I("Human shampoo", "Dog skin has a different pH and can get irritated.", WARN),
        I("Hot water", "It can scald skin and dry it out.", WARN),
        I("Water in the ears", "Moisture in the ears can lead to infections. Dry them gently afterwards.", "ear-hearing"),
        I("Leaving the coat damp", "Moisture under a thick coat is a common cause of skin infections.", WARN),
      ], { tone: "warn" }),
      tip("After a swim 💡", `Rinse ${PN} with fresh water after pools or the sea, and dry the coat and ears. Chlorine and salt can irritate the skin.`),
    ];
  },

  basic_commands(sp, d) {
    if (sp === "dog") {
      return [
        about("Sit, stay, come & more", `${d.trainAbout}`, [
          F("Session", "5 – 10 minutes", "timer-outline"), F("Frequency", "2 – 3 times a day", "calendar-check-outline"), F("Rewards", "Treats & praise", "cookie-outline"), F("Start in", "A quiet place", "home-outline"),
        ]),
        timeline("The core commands", [
          T("Sit", "Treat over the nose", `Hold a treat just above ${PN}'s nose and move it back over the head. The bottom lowers, so say "Sit" and reward.`),
          T("Down", "From sit to floor", `With ${PN} sitting, lower a treat to the floor between the paws. When the dog lies down, say "Down" and reward.`),
          T("Stay", "Build duration slowly", `Ask for a sit, show your palm and say "Stay". Take one step back, return and reward. Add distance and time bit by bit.`),
          T("Come", "Make it the best word", `Say the name and "Come" in a happy voice and reward generously. Never scold when ${PN} comes to you.`),
          T("Leave it", "Look away = reward", `Hold a treat in your closed fist. When ${PN} stops trying to get it and looks away, say "Leave it" and reward from the other hand.`),
        ]),
        list("Training rules", [
          I("Reward within 2 seconds", "Dogs link the reward with whatever they just did.", "timer-outline"),
          I("One cue, one word", "Use the same word every time and avoid repeating it.", OK),
          I("Keep it happy", "Calm, upbeat energy makes learning easier.", OK),
          I("End on a win", `Finish with something ${PN} does well, then play.`, OK),
          I("Practise in new places", "Move on to the garden, the park and then busier areas.", OK),
        ]),
        tip("Did You Know? 💡", d.trainTip),
      ];
    }
    if (sp === "cat") {
      return [
        about("Basic training for cats", `${d.trainAbout}`, [
          F("Session", "2 – 5 minutes", "timer-outline"), F("Frequency", "Once or twice a day", "calendar-check-outline"), F("Rewards", "Small treats & praise", "cookie-outline"), F("Start in", "A quiet room", "home-outline"),
        ]),
        timeline("The core skills", [
          T("Name", "Say it, then reward", `Say ${PN}'s name once in a happy voice. When ${PN} looks at you, give a tiny treat.`),
          T("Come", "Call and treat", "Call from a short distance and reward every time. Then build the distance."),
          T("Target", "Touch the target", "Hold a chopstick or your finger near the nose. When the nose touches it, mark and reward."),
          T("Carrier", "Make it a safe place", "Leave the carrier out with treats and a blanket inside, so it becomes a normal place."),
          T("Handling", "Short and gentle", "Touch paws, ears and mouth for a second, then reward. Build up very slowly."),
        ]),
        list("Training rules", [
          I("Rewards only", "Never shout, hit or spray water. It makes cats fearful.", OK),
          I("Keep it short", "Stop before the cat loses interest.", OK),
          I("Use a clicker", "A clicker marks the exact moment of a good choice.", OK),
          I("End on a win", "Finish with something easy, then play.", OK),
        ]),
        tip("Did You Know? 💡", d.trainTip),
      ];
    }
    return [
      about("Basic training for rabbits", `${d.trainAbout}`, [
        F("Session", "2 – 5 minutes", "timer-outline"), F("Frequency", "Once or twice a day", "calendar-check-outline"), F("Rewards", "Tiny pieces of herb or leaf", "leaf"), F("Start in", "A calm, safe space", "home-outline"),
      ]),
      timeline("The core skills", [
        T("Litter", "Hay in the tray", "Put hay in the litter tray. Rabbits eat and go at the same time. Place the tray where the rabbit already goes."),
        T("Name", "Say it, then reward", `Say ${PN}'s name and offer a tiny treat when ${PN} comes closer.`),
        T("Target", "Nose-touch", "Hold a finger or small stick near the nose. When the nose touches it, mark and reward."),
        T("Handling", "Support all four feet", "Pet near the forehead and cheeks. Lift only when needed, with the whole body supported."),
      ]),
      list("Training rules", [
        I("Let the rabbit come to you", "Sit on the floor and wait. Never chase.", OK),
        I("Rewards only", "Never shout or punish. Rabbits freeze or run when scared.", OK),
        I("Short and calm", "Stop when the rabbit loses interest.", OK),
      ]),
      tip("Did You Know? 💡", d.trainTip),
    ];
  },

  car_safety(sp, d) {
    if (sp === "dog") {
      return [
        about(`Travel safe with ${PN}`, `An unrestrained dog can be injured in a sudden stop and can distract the driver. ${d.carNote}`, [
          F("Restraint", "Crash-tested harness or crate", "seatbelt"), F("Seat", "Back seat", "car"), F("Windows", "Head stays inside", "window-closed-variant"), F("Breaks", "Every 2 hours", "timer-outline"),
        ]),
        timeline("Before you set off", [
          T("Practise", "Start with short drives", "Make the car a happy place with treats and a trip to somewhere fun."),
          T("Prepare", "Exercise and potty first", "A tired dog who has been to the toilet settles much better."),
          T("Feed light", "Small meal 2 – 3 hours before", "A full stomach can cause motion sickness."),
          T("Secure", "Harness or crate", "Use a crash-tested harness clipped to a seat belt, or a well-secured crate."),
          T("Pack", "Travel kit", `Water and bowl, leash, poop bags, towel, treats and ${PN}'s PetCard.`),
        ]),
        list("Never", [
          I(`Leave ${PN} in a parked car`, "Even with windows open, temperatures can become deadly within minutes.", WARN),
          I("Let the dog ride with its head out", "Dust and debris can hurt the eyes, ears and nose.", WARN),
          I("Hold the dog on your lap", "It is unsafe for both of you, and can make you lose control.", WARN),
          I("Use the front seat", "Airbags can seriously injure a dog.", WARN),
          I("Travel in an open truck bed", "Unrestrained dogs can fall or be thrown out.", WARN),
        ], { tone: "danger" }),
        tip("Motion sickness? 💡", "Drooling, yawning, whining and vomiting are common signs. Try shorter trips, fresh air and a light meal. If it continues, ask your vet about help."),
      ];
    }
    const kind = sp === "cat" ? "cat" : "rabbit";
    return [
      about(`Travel safe with ${PN}`, `A loose ${kind} can be hurt, hide under the pedals or escape when a door opens. A secure carrier makes every trip safer. ${d.carNote}`, [
        F("Restraint", "Hard-sided carrier", "bag-suitcase-outline"), F("Placement", "Seat belt or footwell", "car"), F("Cover", "A light cloth for calm", "weather-night"), F("Breaks", "Check often on long trips", "timer-outline"),
      ]),
      timeline("Before you set off", [
        T("Practise", "Make the carrier familiar", "Leave it open at home with treats, a blanket and some hay or a favourite toy inside."),
        T("Prepare", sp === "cat" ? "Litter and a light meal" : "Hay and fresh greens", sp === "cat" ? "Offer the litter box before the trip. Skip a big meal beforehand." : "Pack hay, greens and a heavy bowl. Skip new foods."),
        T("Secure", "Fasten the carrier", "Strap it in with a seat belt or wedge it so it cannot slide or tip."),
        T("Keep cool", "Control the temperature", "Use air conditioning. Cover the carrier with a light cloth, never a thick blanket."),
        T("Pack", "Travel kit", `Water, a towel, wipes, a spare carrier pad and ${PN}'s PetCard.`),
      ]),
      list("Never", [
        I(`Leave ${PN} in a parked car`, "Temperatures can become deadly within minutes, even with windows open.", WARN),
        I(`Let ${PN} roam loose in the car`, "It is unsafe for the pet and the driver.", WARN),
        I("Open the carrier in the car", "Even a calm pet can bolt when scared.", WARN),
        I("Put the carrier in the sun", "Heat builds quickly behind glass.", WARN),
      ], { tone: "danger" }),
      tip("Stressed in the car? 💡", sp === "cat" ? "Panting, drooling, crying or hiding are stress signs. Try shorter trips with treats. A vet can help if it continues." : "Rabbits stress easily. Keep the car quiet and cool, and do not stop to take the rabbit out. Call a vet if the rabbit stops eating after a trip."),
    ];
  },

  common_health_issues(sp, d) {
    const extra = {
      dog: [I("Swollen, hard belly with retching", "Possible bloat is a life-threatening emergency.", WARN)],
      cat: [I("Straining to pee, or no pee", "A blocked urinary tract can be fatal within a day, most often in male cats.", WARN), I("Not eating for 24 hours", "Cats can develop liver problems quickly.", WARN)],
      rabbit: [I("No food or droppings for 8 – 12 hours", "Gut stasis is an emergency in rabbits.", WARN), I("Head tilt, rolling or sudden weakness", "Needs a rabbit-savvy vet quickly.", WARN)],
    }[sp];
    return [
      about("Notice changes early", `Changes in appetite, energy, breathing, drinking, bathroom habits, skin or behaviour can be signs that ${PN} needs attention. Compare changes with the normal routine and record when they began.`),
      list("Signs to watch", [
        I("Digestive changes", "Repeated vomiting, diarrhoea, a swollen belly or refusing food.", WARN),
        I("Skin and ears", "Persistent scratching, redness, odour, discharge or hair loss.", "medical-bag"),
        I("Energy and movement", "Unusual tiredness, limping, weakness or reluctance to move.", "walk"),
        I("Drinking and urination", "A sudden sustained increase or decrease in either.", "water-outline"),
      ], { tone: "warn" }),
      list(d.label === "dog" || d.label === "cat" || d.label === "rabbit" ? `Common in ${d.label}s` : `Common in ${d.label}s`, d.concerns, { tone: "warn", intro: "Good to know about, not a guarantee. Ask your vet which check-ups suit this pet." }),
      list("When to get urgent help", [
        I("Trouble breathing", "Gasping, blue or pale gums, or breathing with effort.", WARN),
        I("Collapse or seizure", "Cannot stand, or a seizure lasting more than 2 – 3 minutes.", WARN),
        I("Suspected poisoning", "Chocolate, xylitol, medicines, plants or rat poison: call straight away.", WARN),
        I("Heavy bleeding or injury", "Bleeding that does not stop after 5 minutes of pressure.", WARN),
        ...extra,
        I("Avoid self-medicating", "Do not give human medicines unless a vet tells you to.", "shield-alert-outline"),
      ], { tone: "danger" }),
      tip("Keep a record", "Use PetCard Health Records to note symptoms, dates, medication instructions and vet follow-ups. This screen gives general information, not a diagnosis.", { label: "Open Health Records", route: "/HealthRecordScreen" }),
    ];
  },
};

/* Extra per-breed notes used by the second batch of pages (play, sleep, love, feeding, treats, human foods). */
const EXTRA_GENERIC = {
  dog: { play: "Most dogs need a mix of active play, brain games and calm time.", sleep: "Adult dogs sleep about 12 – 14 hours a day. Puppies and seniors sleep more.", love: "Dogs bond through attention, touch and shared activities.", feed: "Most adult dogs do well on two meals a day. Deep-chested dogs should rest after eating.", treat: "Keep treats small and count them in the daily food.", human: "Stick to small portions of safe foods, and skip anything you are unsure about." },
  cat: { play: "Cats play in short bursts that copy hunting: stalk, chase, pounce.", sleep: "Cats sleep 12 – 16 hours a day, often in short naps.", love: "Cats bond on their own terms, through calm time, play and gentle touch.", feed: "Most adult cats do well on two or three small meals a day.", treat: "Keep treats tiny and count them in the daily food.", human: "Cats are strict carnivores, so most human food is not needed and some is toxic." },
  rabbit: { play: "Rabbits love to hop, dig, chew and hide. They need safe space every day.", sleep: "Rabbits rest 8 – 12 hours a day, in short naps, and are most active at dawn and dusk.", love: "Rabbits bond slowly, by sitting calmly with you on the floor.", feed: "Hay is available all day. Pellets and greens are given in measured amounts.", treat: "Treats for rabbits are tiny pieces of fruit or herbs, and only now and then.", human: "A rabbit's gut is delicate. Only a few vegetables and herbs are safe." },
};
const EXTRA_BREED = {
  dog: {
    "hungarian-vizsla": { play: "Vizslas love retrieving, running and scent games. They need a safe, fenced space to run every day.", sleep: "The thin coat feels the cold, so give a warm bed and a blanket. Vizslas like to sleep close to their people.", love: "Vizslas are 'velcro dogs' that want to be near their person. Closeness and shared activities matter a lot.", feed: "Feed 2 meals and rest for an hour around hard exercise. Keep the body lean and athletic.", treat: "Tiny pieces of meat or kibble work well for retrieving and scent games. Count them in the daily food.", human: "An active Vizsla burns many calories, but rich scraps still add weight. Keep human food lean and plain." },
    "border-collie": { play: "Border Collies enjoy frisbee, agility, find-it games and learning new tricks. Mental games tire them as much as running.", sleep: "A Border Collie can find it hard to switch off. Teach a 'settle' on a mat and give a quiet, den-like bed.", love: "A Border Collie wants a job to do with you. Training and games are the best quality time.", feed: "Feed 2 meals and adjust with the season, since the exercise level changes. Rest after hard work before eating.", treat: "Use tiny, high-value treats for training. Count them in the daily food so weight stays steady.", human: "Even an active collie gains weight on rich scraps. Choose lean, plain safe foods." },
    "japanese-akita": { play: "Akitas like short games, tug with rules and scent games, best in the cool hours. Avoid heavy play in the heat.", sleep: "An Akita likes a cool floor or tile and shade. The thick double coat makes hot rooms uncomfortable.", love: "Akitas are loyal and calm, and show love quietly. Let affection happen at the dog's own pace and respect its space.", feed: "Feed 2 meals instead of 1 big meal, and keep exercise calm for about an hour before and after eating because Akitas can get bloat.", treat: "Large breed, so keep treats low-fat and small. Extra weight is hard on the hips.", human: "Rich, fatty foods can cause pancreatitis, and big meals raise the risk of bloat in Akitas. Keep portions small." },
  },
  cat: {
    persian: { play: "Persians prefer gentle wand play in short sessions. A flat face tires quickly, so avoid play in the heat.", sleep: "A Persian can sleep up to 16 hours a day. Give a soft bed in a quiet place that is warm but never hot.", love: "Persians are calm lap cats. Daily combing is a great bonding ritual when done gently with treats.", feed: "Offer 2 – 3 small meals in a shallow dish, and wipe the face after eating.", treat: "Tiny treats only, since Persians gain weight easily. Pick small, soft pieces.", human: "Keep to cat-safe foods only. Persians gain weight easily, so skip human snacks." },
    himalayan: { play: "Himalayans like gentle wand play and soft toys in short sessions. A flat face tires quickly, so avoid heat.", sleep: "A Himalayan can sleep up to 16 hours a day. Give a soft bed in a quiet place that is warm but never hot.", love: "Himalayans are sweet and calm. Gentle combing and quiet lap time bring you close.", feed: "Offer 2 – 3 small meals in a shallow dish, and wipe the face after eating.", treat: "Tiny treats only, since Himalayans gain weight easily. Pick small, soft pieces.", human: "Keep to cat-safe foods only. Himalayans gain weight easily, so skip human snacks." },
  },
  rabbit: {
    "holland-lop": { play: "Holland Lops love tunnels, cardboard boxes and toss toys. Keep the floor non-slip and rabbit-proofed.", sleep: "A Holland Lop likes a quiet hide box away from noise. Short naps are normal.", love: "Holland Lops are friendly and playful. Sit on the floor and let the rabbit come to you.", feed: "Unlimited hay all day, a small measured portion of pellets and greens in the evening.", treat: "A very small piece of fruit now and then. Small rabbits gain weight quickly.", human: "A small rabbit gets sick from small mistakes. Give only tiny bites of safe vegetables." },
    "newzealand-bunny": { play: "New Zealand rabbits need space to run and jump. Provide a soft, solid floor, never wire.", sleep: "A large rabbit needs a roomy, soft, solid bed to protect the feet and hocks.", love: "New Zealand rabbits are docile and calm. Long, quiet floor time together builds trust.", feed: "Plenty of hay every day, measured pellets and a variety of greens. A large rabbit eats a lot of hay.", treat: "Herbs and a small piece of fruit now and then. Large rabbits still gain weight easily.", human: "A large rabbit still has a delicate gut. Give only safe vegetables and herbs, introduced slowly." },
  },
};

Object.assign(PAGES, {
  love_attention(sp, d) {
    const ways = {
      dog: [I("Daily cuddle time", "Sit together and give your full attention, with no phone.", "heart-outline"), I("Massage", "Gently rub the ears, chest and shoulders. Most dogs love it.", "hand-heart-outline"), I("Grooming together", "Brushing turns care into a calm, loving ritual.", "brush"), I("Learn something new", "Tricks and games build teamwork.", "school-outline"), I("Share adventures", "New walks and trips make memories.", "walk")],
      cat: [I("Quiet lap time", "Let the cat choose to sit with you. Never force it.", "heart-outline"), I("Interactive play", "A wand toy session builds trust.", "tennis-ball"), I("Gentle strokes", "Cheeks, chin and the base of the ears are usually favourites.", "hand-heart-outline"), I("Slow blinks", "Slow-blink at your cat. A slow blink back is a sign of trust.", "eye-outline"), I("Respect alone time", "A hiding spot is a safe place, not a punishment.", "home-outline")],
      rabbit: [I("Floor time", "Sit or lie down on the floor and let the rabbit explore you.", "heart-outline"), I("Gentle strokes", "Forehead, cheeks and the back of the neck are favourites.", "hand-heart-outline"), I("Hand-feed greens", "A leaf from your hand builds trust.", "leaf"), I("Quiet company", "Read or relax nearby while the rabbit hops about.", "home-heart"), I("Respect fear", "Never chase or pick up a rabbit that is hiding.", "hand-back-left-outline")],
    }[sp];
    const feelings = {
      dog: [I("Happy & relaxed", "Loose body, soft eyes, wagging tail, open mouth.", "emoticon-happy-outline"), I("Worried or anxious", "Tucked tail, lip licking, yawning, showing the whites of the eyes.", "emoticon-sad-outline"), I("Wants space", "Turns away, stiffens or moves off. Respect it.", "hand-back-left-outline")],
      cat: [I("Happy & relaxed", "Tail up, slow blinks, purring and kneading.", "emoticon-happy-outline"), I("Worried or anxious", "Flat ears, wide eyes, tail tucked or lashing.", "emoticon-sad-outline"), I("Wants space", "Walks away, flicks the tail or hides. Respect it.", "hand-back-left-outline")],
      rabbit: [I("Happy & relaxed", "Lying stretched out, 'binky' jumps, gentle teeth purring.", "emoticon-happy-outline"), I("Worried or anxious", "Thumping, freezing, ears flat, hiding.", "emoticon-sad-outline"), I("Wants space", "Hops away, turns its back or hides. Respect it.", "hand-back-left-outline")],
    }[sp];
    const dyk = { dog: "Studies show that gazing at each other raises oxytocin, the \"love hormone\", in both dogs and their owners. A few quiet minutes of eye contact and a soft voice really do strengthen your bond.", cat: "A slow blink is often called a 'cat kiss'. Try it at a relaxed distance, and wait to see whether your cat slow-blinks back.", rabbit: "A 'binky' is a joyful jump with a twist. If you see one, your rabbit feels safe and happy." }[sp];
    return [
      about(`Bonding with ${PN}`, `${d.love} Spending focused, loving time with ${PN} every day builds trust and confidence.`, [
        F("Every day", "One-on-one time", "account-heart-outline"), F("Touch", "Gentle and welcome", "hand-heart-outline"), F("Voice", "Calm and happy", "message-text-outline"), F("Learning", sp === "dog" ? "Bond through training" : "Bond through play", "school-outline"),
      ]),
      list("Ways to bond", ways),
      list(`Reading ${PN}'s feelings`, feelings),
      tip("Did You Know? 💗", dyk),
    ];
  },

  playtime(sp, d) {
    const daily = { dog: "30 – 60 minutes", cat: "20 – 30 minutes", rabbit: "3 – 4 hours of free-roam" }[sp];
    const timelineSteps = {
      dog: [T("Warm-up", "5-minute walk", "Gets muscles ready before running and jumping."), T("Active play", "10 – 15 minutes", "Fetch, chase or tug. This is where the dog burns energy."), T("Brain game", "5 – 10 minutes", "A puzzle toy or find-the-treat game."), T("Cool-down", "Calm time", "Cuddles, fresh water and a rest.")],
      cat: [T("Stalk", "Slow wand movement", "Move the toy like prey, slowly, then hide it."), T("Chase", "5 – 10 minutes", "Quick movements and short darts."), T("Catch", "Let the cat win", "End by letting the cat 'catch' the toy."), T("Treat", "Reward and rest", "A small meal or treat completes the hunt.")],
      rabbit: [T("Morning", "Free-roam", "Safe, rabbit-proofed space."), T("Midday", "Chew & dig", "A hay-filled box and willow toys."), T("Evening", "Active play", "Tunnels, jumps and toss toys."), T("Night", "Calm check", "Hay, water and a quiet cuddle.")],
    }[sp];
    const ideas = {
      dog: [I("Fetch", "A classic. Use balls or soft toys.", "tennis-ball"), I("Tug with rules", "Start and stop on cue to keep it fun and safe.", "rope"), I("Hide & seek", "Hide behind a door and call the name.", "eye-off-outline"), I("Puzzle toys", "Treat-dispensing toys keep the brain busy.", "puzzle-outline"), I("Playdates", "Meet friendly, vaccinated dogs.", "paw")],
      cat: [I("Wand toys", "The best way to play with a cat. Always put it away afterwards.", "tennis-ball"), I("Climbing", "Cat trees and shelves give safe height.", "stairs-up"), I("Foraging", "Hide treats around the home.", "puzzle-outline"), I("Boxes & tunnels", "A cardboard box is a great toy.", "package-variant"), I("Window time", "A perch with a view is great enrichment.", "window-open-variant")],
      rabbit: [I("Tunnels and boxes", "Cardboard tunnels are perfect for hiding and zooming.", "package-variant"), I("Chew toys", "Willow, apple wood and hay-filled rolls protect the teeth.", "tree-outline"), I("Dig box", "A box of shredded paper gives a safe place to dig.", "shovel"), I("Toss toys", "Light toys to flick and throw.", "tennis-ball"), I("Obstacle course", "Low jumps and platforms.", "stairs-up")],
    }[sp];
    const safety = {
      dog: [I("Choose the right size", "Toys that are too small can be swallowed.", WARN), I("Skip sticks", "They can splinter and injure the mouth or throat.", WARN), I("Check toys for wear", "Throw away anything torn or crumbling.", WARN), I("Rest after meals", "Hold off on vigorous play for about an hour after eating.", WARN), I("Stop if limping or panting heavily", "Give a break and fresh water.", WARN)],
      cat: [I("No string unsupervised", "Cats can swallow string, ribbon or elastic.", WARN), I("Check toys for wear", "Remove loose parts and feathers that come off.", WARN), I("Do not use hands or feet", "It teaches that skin is a toy.", WARN), I("Watch for overheating", "Open-mouth breathing means stop.", WARN)],
      rabbit: [I("Rabbit-proof the room", "Cover or lift all cables. Rabbits chew everything.", WARN), I("Safe floors", "Avoid slippery floors. Use rugs or mats.", WARN), I("Never use balls with bells or small parts", "They can be swallowed.", WARN), I("Never chase", "Rabbits are prey animals, and chasing causes fear.", WARN)],
    }[sp];
    return [
      about("Importance of play", `Play isn't just fun. It burns energy, exercises the brain and strengthens the bond with ${PN}. ${d.play}`, [
        F("Daily play", daily, "clock-outline"), F("Types", sp === "dog" ? "Fetch, tug & puzzles" : sp === "cat" ? "Wand toys & climbing" : "Tunnels & chew toys", "tennis-ball"), F("Mix", "Active + calm play", "puzzle-outline"), F("Always", "Supervise", "eye-outline"),
      ]),
      timeline("A playtime routine", timelineSteps),
      list("Play ideas", ideas),
      list("Play safety", safety, { tone: "warn" }),
    ];
  },

  sleep_rest(sp, d) {
    const hours = { dog: ["12 – 14 hours", "18 – 20 hours", "14 – 18 hours"], cat: ["12 – 16 hours", "Up to 20 hours", "16 – 20 hours"], rabbit: ["8 – 12 hours", "8 – 12 hours", "10 – 12 hours"] }[sp];
    const word = { dog: "Puppy", cat: "Kitten", rabbit: "Young" }[sp];
    return [
      about(`How much sleep does ${PN} need?`, `${d.sleep} Rest helps the body repair, the brain process the day and the mood stay balanced. Needs change with age and activity.`, [
        F("Adult", hours[0], "sleep"), F(word, hours[1], "bed-outline"), F("Senior", hours[2], "bed"), F("Best spot", "Quiet, dim & cosy", "home-outline"),
      ]),
      list("Create a great sleep space", [
        I("Supportive bed", sp === "rabbit" ? "A soft, solid bed or hay-filled box. Avoid wire floors." : "A soft, supportive bed. An orthopaedic bed helps older pets and large breeds.", "bed-outline"),
        I("Quiet corner", "Away from doors, the TV and heavy footfall.", "home-outline"),
        I("Comfortable temperature", "Keep the spot cool in summer and warm in winter.", "thermometer"),
        I("Regular routine", "Winding down at the same time each night helps pets settle.", "clock-outline"),
        I(sp === "rabbit" ? "A hide box" : "A cosy hideaway", "A blanket and a favourite toy make it a safe den.", OK),
      ]),
      list("Sleep red flags", [
        I("Can't settle or keeps pacing", "May point to pain, anxiety or needing the toilet.", "alert-outline"),
        I("Sleeping far more than usual", "Along with low energy or loss of appetite, see your vet.", "alert-outline"),
        I("New loud snoring or laboured breathing", "Needs a check-up.", "alert-outline"),
        I("Panting or crying at night", "Can signal discomfort or stress.", "alert-outline"),
      ], { tone: "warn" }),
      tip("Did You Know? 💡", sp === "rabbit" ? `Rabbits often sleep with their eyes partly open. A relaxed rabbit may flop on its side. This is a sign that ${PN} feels safe.` : `Twitching, paddling paws and soft sounds during sleep are normal. ${PN} is probably dreaming! It's best not to wake a pet during deep sleep.`),
    ];
  },

  feeding_schedule(sp, d) {
    const facts = {
      dog: [F("Adult", "2 meals a day", "clock-outline"), F("Puppy", "3 – 4 meals a day", "calendar-check-outline"), F("Senior", "2 smaller meals", "food-apple-outline"), F("Gap", "10 – 12 hours apart", "timer-outline")],
      cat: [F("Adult", "2 – 3 meals a day", "clock-outline"), F("Kitten", "3 – 4 meals a day", "calendar-check-outline"), F("Senior", "2 – 3 smaller meals", "food-apple-outline"), F("Water", "Always available", "cup-water")],
      rabbit: [F("Hay", "Always available", "grass"), F("Pellets", "Measured, once or twice", "food-variant"), F("Greens", "Evening, a variety", "leaf"), F("Water", "Always available", "cup-water")],
    }[sp];
    const sample = {
      dog: [T("7:00 – 8:00 AM", "Breakfast", "Half of the daily portion plus fresh water. Wait 30 – 60 minutes before hard exercise."), T("12:00 PM", "Water & light training", "Refill water. Any training treats count towards the daily total."), T("6:00 – 7:00 PM", "Dinner", "The other half of the portion, at a calm pace."), T("9:00 PM", "Last potty break", "Avoid big meals right before bed.")],
      cat: [T("7:00 AM", "Breakfast", "A measured meal and fresh water."), T("12:30 PM", "Light snack or puzzle feeder", "Optional, and counted in the daily total."), T("6:00 PM", "Dinner", "A measured meal at the same time every day."), T("9:00 PM", "Fresh water & litter check", "Scoop the litter box.")],
      rabbit: [T("7:00 AM", "Hay & pellets", "Refill the hay rack and give the measured pellets."), T("Midday", "Hay and water", "Check that hay and water are fresh."), T("6:00 PM", "Fresh greens", "A variety of leafy greens, washed."), T("9:00 PM", "Hay top-up", "Rabbits graze through the night.")],
    }[sp];
    return [
      about("How much & how often", `${d.feed} The right portion depends on weight, age and activity, so start with the feeding guide on the food pack and adjust with your vet.`, facts),
      timeline("A sample day", sample),
      list("Feeding tips", [
        I("Measure every meal", "Use a cup or kitchen scale. Eyeballing is the easiest way to overfeed.", "scale-bathroom"),
        I("Keep the same times", "A steady routine helps digestion and toilet habits.", "clock-outline"),
        I(sp === "rabbit" ? "Hay is the base" : "Don't free-feed", sp === "rabbit" ? "Hay should be available at all times. It is the main food." : `Leaving food out all day makes it hard to track how much ${PN} eats.`, sp === "rabbit" ? OK : "close-circle-outline"),
        I(sp === "dog" ? "Rest after meals" : "Change food slowly", sp === "dog" ? "Deep-chested dogs can get bloat. Keep play calm for about an hour after eating." : "Mix the new food into the old over 7 – 10 days.", WARN),
        I("Treats under 10%", "Treats and chews should be no more than a tenth of the daily food.", "cookie-outline"),
      ]),
      tip(`Track ${PN}'s meals 🍽️`, "Log what is eaten so you can see portions at a glance and spot changes in appetite early.", { label: "Open Food tracker", route: "/FoodScreen" }),
    ];
  },

  human_foods(sp, d) {
    const safe = {
      dog: [I("Carrots, cucumber, green beans", "Crunchy, low-calorie snacks.", "carrot"), I("Apple slices", "Remove the core and seeds.", "food-apple-outline"), I("Blueberries & watermelon", "Seedless and without rind.", "fruit-watermelon"), I("Plain cooked chicken or turkey", "No bones, skin, salt or seasoning.", "food-drumstick-outline"), I("Plain cooked rice & pumpkin", "Gentle on the tummy.", "grain"), I("Cooked egg", "Fully cooked and plain.", "egg-outline")],
      cat: [I("Plain cooked chicken or turkey", "No bones, skin, salt or seasoning. A small piece only.", "food-drumstick-outline"), I("Plain cooked fish", "Boneless, without salt or sauce, now and then.", "fish"), I("Cooked egg", "Fully cooked and plain, in small amounts.", "egg-outline"), I("A little plain pumpkin", "Can help with digestion, in tiny amounts.", "grain")],
      rabbit: [I("Leafy greens", "Romaine, coriander, rocket, dill and mint. Introduce one at a time.", "leaf"), I("Herbs", "Parsley, basil and mint in small amounts.", "leaf"), I("Carrot tops", "Better than carrots, which are sugary.", "carrot"), I("Small pieces of fruit", "Apple (no seeds) or berries, only as a rare treat.", "food-apple-outline")],
    }[sp];
    const never = {
      dog: [I("Chocolate & cocoa", "Contains theobromine, which can cause vomiting, tremors and seizures.", "skull-outline"), I("Grapes & raisins", "Can cause sudden kidney failure, even in small amounts.", "skull-outline"), I("Onion, garlic & chives", "Damage red blood cells. Cooked or powdered forms are also unsafe.", "skull-outline"), I("Xylitol", "A sweetener in sugar-free gum, sweets and some peanut butters. Very dangerous.", "skull-outline"), I("Macadamia nuts, alcohol & caffeine", "Toxic to dogs, even in small quantities.", "skull-outline"), I("Cooked bones", "They splinter and can injure the mouth or gut.", "bone"), I("Fried, salty & fatty foods", "Can trigger pancreatitis and obesity.", WARN)],
      cat: [I("Onion, garlic & chives", "Damage red blood cells in cats.", "skull-outline"), I("Chocolate & caffeine", "Toxic to cats.", "skull-outline"), I("Grapes & raisins", "Can cause kidney failure.", "skull-outline"), I("Lilies (the plant)", "Every part of the plant, even the pollen, can cause kidney failure.", "skull-outline"), I("Alcohol & raw dough", "Dangerous, even in small amounts.", "skull-outline"), I("Xylitol", "A sweetener in sugar-free products. Very dangerous.", "skull-outline"), I("Milk and dairy", "Many cats cannot digest lactose.", WARN)],
      rabbit: [I("Chocolate & sweets", "Toxic and far too sugary.", "skull-outline"), I("Onion, garlic & chives", "Harmful to rabbits.", "skull-outline"), I("Avocado", "Toxic to rabbits.", "skull-outline"), I("Bread, biscuits & cereal", "Starchy foods upset the gut.", WARN), I("Potato & rhubarb", "Not safe for rabbits.", "skull-outline"), I("Nuts and seeds", "Too fatty, and a choking risk.", WARN), I("Iceberg lettuce", "Low in nutrients and can cause loose droppings.", WARN)],
    }[sp];
    return [
      about("What's safe & what's not", `Some human foods are fine as small snacks, but others are toxic. ${d.human}`, [
        F("Safe", sp === "dog" ? "Carrot, apple, pumpkin" : sp === "cat" ? "Plain cooked chicken or fish" : "Leafy greens & herbs", "carrot"), F("Toxic", sp === "dog" ? "Chocolate, grapes, xylitol" : sp === "cat" ? "Onion, lilies, chocolate" : "Chocolate, avocado, onion", "skull-outline"), F("Portion", "Small bites only", "scale-bathroom"), F("Rule", "When in doubt, ask", "help-circle-outline"),
      ]),
      list("Generally safe (in moderation)", safe),
      list("Never feed", never, { tone: "danger" }),
      tip(`If ${PN} eats something toxic 🚨`, "Don't wait for symptoms. Call your vet right away and keep the packaging handy. See the full list of toxic items for more.", { label: "View Toxic Items", route: "/Safety/ToxicItemScreen" }),
    ];
  },

  treats_rewards(sp, d) {
    const treats = {
      dog: [I("Carrot sticks & cucumber", "Crunchy and very low in calories.", "carrot"), I("Apple & blueberries", "Sweet, fresh and full of vitamins. Remove apple seeds.", "food-apple-outline"), I("Freeze-dried meat", "Single-ingredient chicken or fish pieces are great training rewards.", "food-drumstick-outline"), I("Pieces of the regular kibble", "The easiest way to reward without adding extra calories.", "bowl-mix-outline"), I("Vet-approved dental chews", "Help keep teeth clean as well.", "tooth-outline")],
      cat: [I("Freeze-dried meat", "Single-ingredient chicken or fish pieces, torn into tiny bits.", "food-drumstick-outline"), I("Plain cooked chicken", "A very small piece, with no salt or seasoning.", "food-drumstick-outline"), I("Pieces of the regular food", "The easiest way to reward without extra calories.", "bowl-mix-outline"), I("Vet-approved dental treats", "Help with teeth, in small numbers.", "tooth-outline")],
      rabbit: [I("Fresh herbs", "A small sprig of mint, basil or coriander is a favourite.", "leaf"), I("A tiny piece of fruit", "Apple (no seeds), berries or banana, the size of a thumbnail.", "food-apple-outline"), I("Willow or apple wood sticks", "Safe chews that wear down the teeth.", "tree-outline"), I("Leafy greens", "A leaf from your hand makes a great reward.", "leaf")],
    }[sp];
    const second = sp === "dog"
      ? timeline("Quick recipe: pumpkin & oat biscuits", [
        T("Step 1", "Mix", "Combine 1 cup oat flour, ½ cup plain pumpkin purée and 1 egg into a firm dough."),
        T("Step 2", "Shape", "Roll it out and cut into small, bite-sized pieces."),
        T("Step 3", "Bake", "Bake at 175 °C for about 20 minutes until firm."),
        T("Step 4", "Cool & store", "Let them cool completely. Keep in an airtight container in the fridge for up to 5 days."),
      ], "Simple, sugar-free and easy to make at home.")
      : timeline("How to give treats", [
        T("Step 1", "Choose the moment", `Reward ${PN} within 2 seconds of the behaviour you like.`),
        T("Step 2", "Keep it tiny", sp === "cat" ? "A treat the size of a pea is enough." : "A piece the size of a thumbnail is enough."),
        T("Step 3", "Say the cue", "Use the same happy word every time, then give the treat."),
        T("Step 4", "Count it", "Reduce the regular meal a little on treat-heavy days."),
      ]);
    return [
      about("Healthy treat ideas", `Treats are perfect for training and bonding, but they add up fast. ${d.treat}`, [
        F("Limit", sp === "rabbit" ? "A few tiny pieces" : "10% of daily calories", "scale-bathroom"), F("Size", sp === "dog" ? "Pea-sized for training" : "Tiny pieces", "cookie-outline"), F("Best choice", "Single-ingredient", "check-circle-outline"), F("Timing", "Reward right away", "timer-outline"),
      ]),
      list(`Treats ${PN} can enjoy`, treats),
      second,
      list("Treat rules", [
        I("Break treats into tiny pieces", `${PN} doesn't need a whole biscuit to feel rewarded.`, WARN),
        I("Cut back meals a little", "On treat-heavy days, reduce the regular portion slightly.", WARN),
        I(sp === "dog" ? "Avoid rawhide & tiny hard chews" : sp === "cat" ? "Avoid dairy & human snacks" : "Avoid yogurt drops & seed sticks", sp === "dog" ? "They can cause choking or blockages." : sp === "cat" ? "Many cats cannot digest lactose, and human snacks are too salty or fatty." : "Shop-bought rabbit treats are very sugary and can upset the gut.", WARN),
        I("Read the label", "Skip treats with xylitol, artificial colours, or lots of sugar and salt.", WARN),
      ], { tone: "warn" }),
    ];
  },
});

/* ---------------------------------------------- extra breed-wise notes for 4 pages */
const FIX_GENERIC = {
  dog: {
    nail: "Dogs that walk on hard ground wear their nails down, but dogs that mostly walk on soft ground need trims more often.",
    toxic: "Keep every toxic item out of reach, and keep your vet's emergency number saved.",
    home: "Check the home from dog height: cables, bins and open doors are the main risks.",
    watch: "Learn what is normal for your dog: appetite, energy, stool and breathing.",
  },
  cat: {
    nail: "Indoor cats need trims more often, because they have less rough ground to wear their claws down.",
    toxic: "Cats groom their fur, so anything on the coat ends up swallowed. Wipe off spills quickly.",
    home: "Cats are climbers: check shelves, windows and balconies as well as the floor.",
    watch: "Cats hide illness well. Watch litter box habits, appetite and hiding.",
  },
  rabbit: {
    nail: "Rabbits on soft bedding wear their nails down slowly, so check them every few weeks.",
    toxic: "Rabbits chew everything at floor level, so check low shelves, cables and plants.",
    home: "Think at floor level: chewing is the main risk for a rabbit.",
    watch: "Rabbits hide illness well. Check droppings, appetite and teeth every day.",
  },
};

const FIX_BREED = {
  dog: {
    "hungarian-vizsla": {
      bkey: "hungarian-vizsla",
      nail: "Vizslas are athletic and run a lot, so keep nails short to protect the toes and keep good grip. Check the dewclaws, which do not wear down.",
      toxic: "Vizslas are curious, fast and good at counter surfing. Keep food, medicines and bins out of reach and secure the cupboards.",
      home: "Vizslas are athletic jumpers, so secure fences, gates and balcony railings, and avoid leaving the dog alone for long hours.",
      watch: "Vizslas can hide stress. Watch for pacing, licking and changes in appetite, as well as limping and seizures.",
    },
    "border-collie": {
      bkey: "border-collie",
      nail: "Border Collies often run on grass and soft ground, so nails may not wear down. Short nails help with grip and agility work.",
      toxic: "Border Collies are clever enough to open cupboards and bins. Use child locks on cupboards with cleaning products and medicines.",
      home: "A bored Border Collie can become an escape artist. Check gates and fences, and give plenty of exercise before leaving the dog alone.",
      watch: "Border Collies hide pain well. Watch for changes in the eyes, limping and fear of noise.",
    },
    "japanese-akita": {
      bkey: "japanese-akita",
      nail: "Akitas are large with thick, strong nails. Trim in small steps or use a grinder, and get the dog used to paw handling early.",
      toxic: "Akitas are large and can reach counters easily. Keep toxic foods, especially chocolate and onion, well back from the edge, and lock away garden chemicals.",
      home: "Akitas are large and strong, so use sturdy gates and non-slip floors, and keep a cool room available in warm weather.",
      watch: "Akitas are stoic. Watch for a swollen belly, and changes in skin, coat or energy, which can point to thyroid or immune problems.",
    },
  },
  cat: {
    persian: {
      bkey: "persian",
      nail: "Long fur between the toes can hide the claws. Part the fur gently and check the claws every 2 weeks.",
      toxic: "The long coat holds oils, chemicals and spills, and cats lick them off. Wipe or wash spills from the coat straight away.",
      home: "Persians are less athletic than many cats, so add low steps to favourite spots and keep windows and balconies secure.",
      watch: "Persians can have noisy breathing, watery eyes and kidney problems. Report changes in drinking, urination or breathing early.",
    },
    himalayan: {
      bkey: "himalayan",
      nail: "Fur between the toes can hide the claws. Part the fur gently and check the claws every 2 weeks.",
      toxic: "A long coat picks up spills and chemicals, and cats lick them off. Wipe or wash anything on the coat straight away.",
      home: "Himalayans are calm and less athletic than many cats, so add low steps to favourite spots and keep windows and balconies secure.",
      watch: "Himalayans can have breathing, eye and kidney problems. Report changes in drinking, urination or breathing early.",
    },
  },
  rabbit: {
    "holland-lop": {
      bkey: "holland-lop",
      nail: "A small rabbit has tiny nails and a quick that is hard to see. Use small clippers, and ask the vet to show you the first time.",
      toxic: "A small rabbit can squeeze behind furniture and into gaps. Check hidden corners for cables and chemicals.",
      home: "Lop ears can catch in gaps and cables. Block small spaces and keep floors non-slip.",
      watch: "Holland Lops can get dental, ear and gut problems. Check teeth, ears and droppings every day.",
    },
    "newzealand-bunny": {
      bkey: "newzealand-bunny",
      nail: "A large rabbit has thick nails and powerful back legs. Get a helper to hold it calmly, and keep the whole body supported.",
      toxic: "A large rabbit can stretch up to reach low shelves and table edges. Keep plants and chemicals out of reach and covered.",
      home: "A large rabbit needs room to stretch and run. Clear the floor, use non-slip rugs and avoid slippery tiles.",
      watch: "New Zealand rabbits can get sore hocks. Check the feet and weight weekly, as well as droppings every day.",
    },
  },
};
for (const sp of Object.keys(FIX_GENERIC)) Object.assign(EXTRA_GENERIC[sp], FIX_GENERIC[sp]);
for (const sp of Object.keys(FIX_BREED)) for (const [k, v] of Object.entries(FIX_BREED[sp])) Object.assign(EXTRA_BREED[sp][k], v);

/* Adds one breed-aware tip just before the last tip of a page. */
const addTipBeforeLast = (key, title, field) => {
  const orig = PAGES[key];
  PAGES[key] = (sp, d) => {
    const s = orig(sp, d);
    return [...s.slice(0, -1), tip(title, d[field]), s[s.length - 1]];
  };
};

/* ---------------------------------------------- Breed Information page (for BreedInformationScreen) */
PAGES.breed_information = function (sp, d) {
  const rec = d.bkey ? (BREEDS[sp] || []).find((b) => b.key === d.bkey) ?? null : null;
  const p = rec ?? SPECIES_DEFAULT[sp];
  return [
    about(
      rec ? `About ${rec.label}` : `Know your ${sp}`,
      rec
        ? `${rec.label}: ${rec.temperament}. Every pet is different, so use this as a general guide for ${PN}.`
        : `${cap(sp)}s differ a lot by breed, age and personality. This is general guidance for ${PN}. Ask your vet about breed-specific needs.`,
      [F("Origin", p.origin, "crown-outline"), F("Size", cap(p.size), "paw"), F("Lifespan", p.life, "clock-outline"), F("Temperament", p.temperament, "emoticon-happy-outline")]
    ),
    about("Energy, coat & weight", `Typical adult values, for general guidance. ${d.routineNote}`, [
      F("Energy", cap(p.energy.replace("_", " ")), "flash"), F("Coat", cap(p.coat), "brush"), F("Shedding", cap(p.shed), "hair-dryer-outline"), F("Adult weight", `${p.kg[0]} – ${p.kg[1]} kg`, "scale-bathroom"),
    ]),
    list("Common health concerns", d.concerns, { tone: "warn", intro: "Good to know about, not a guarantee. Ask your vet which check-ups suit this pet." }),
    tip("Did You Know? 💡", d.trainTip),
  ];
};


/* ======================================================================
 * BATCH 3 - 15 naye pages (Grooming 3, HealthWellness 3, Safety 4, Training 4 + Exercise/Vet)
 *
 * KAISE LAGANA HAI (backend/src/services/knowGuideContent.js me):
 *
 * 1) GUIDE_PAGE_KEYS me ye 15 keys end me add karo:
 *    "brushing","nail_care","shedding_care","exercise_needs","mental_wellness","signs_to_watch",
 *    "vet_check_ups","home_safety","outdoor_safety","toxic_items","weather_safety",
 *    "behavior_tips","fun_games","house_training","leash_training",
 *
 * 2) GUIDE_TITLES me ye 15 entries add karo:
 *    brushing: "Brushing", nail_care: "Nail Care", shedding_care: "Shedding Care",
 *    exercise_needs: "Exercise Needs", mental_wellness: "Mental Wellness", signs_to_watch: "Signs to Watch",
 *    vet_check_ups: "Vet Check-ups", home_safety: "Home Safety", outdoor_safety: "Outdoor Safety",
 *    toxic_items: "Toxic Items", weather_safety: "Weather Safety", behavior_tips: "Behavior Tips",
 *    fun_games: "Fun Games", house_training: "House Training", leash_training: "Leash Training",
 *
 * 3) Is poore file ka content paste karo: "Object.assign(PAGES, { love_attention ... });" block ke
 *    BAAD aur "/* --- public API --- *\/" se PEHLE.
 *    (Ye file helpers about/list/timeline/tip/F/I/T/OK/WARN/PN, PAGES, EXTRA_GENERIC, EXTRA_BREED use karti hai.)
 * ====================================================================== */

/* ---------------------------------------------- extra per-species / per-breed fields */
const NEW_GENERIC = {
  dog: {
    coat: "Coat care depends on the length and type of the coat. Brush in the direction of hair growth and check the skin as you go.",
    weather: "Dogs cope best when the routine follows the season: cooler hours for exercise in summer, a dry and warm place to rest in winter.",
    mind: "Dogs are social and need company, short training sessions and brain games every day.",
    behave: "Most behaviour problems come from boredom, extra energy or not knowing what is expected.",
    games: "Most dogs enjoy a mix of fetch, scent games and short trick sessions.",
    outdoor: "Walks are the best part of the day. A few simple habits keep them safe and make sure the way home is never lost.",
    house: "Most puppies get the hang of toilet training by 4 – 6 months, and adult dogs can learn too. Accidents along the way are normal.",
    leash: "Introduce the harness and leash gradually with treats and praise, and keep sessions short enough for success.",
  },
  cat: {
    coat: "Cats groom themselves, but brushing removes loose hair, reduces hairballs and lets you check the skin.",
    weather: "Indoor cats like a warm, quiet spot in winter and a cool, shaded one in summer.",
    mind: "Cats need things to watch, climb, hunt and explore. Boredom shows up as scratched furniture or night-time zooming.",
    behave: "Cat behaviour problems almost always have a reason: stress, boredom, or a medical issue.",
    games: "Cats love games that copy hunting: stalk, chase, pounce and catch.",
    outdoor: "Indoor cats are the safest. If a cat goes outside, an ID tag, a microchip and a secure, enclosed space lower the risk.",
    house: "Most cats use a litter box naturally. Problems usually point to a dirty box, stress or a health problem.",
    leash: "Some cats can learn to walk in a secure, well-fitted harness. Go slowly and let the cat set the pace.",
  },
  rabbit: {
    coat: "Rabbits groom themselves, but brushing removes loose fur, which stops swallowed hair building up in the gut.",
    weather: "Rabbits cope better with cold than with heat. Keep them cool in summer, and dry and draught-free in winter.",
    mind: "Rabbits are curious and social. They need space to explore, things to chew and dig, and company.",
    behave: "Thumping, chewing and digging are natural rabbit behaviours. Give safe outlets and ask the vet about neutering or spaying.",
    games: "Rabbits enjoy tunnels, boxes to hide in, toss toys and dig boxes.",
    outdoor: "Rabbits are safest in a secure, shaded run with a hide and a cover on top. Never leave them in the sun or alone with predators nearby.",
    house: "Rabbits naturally pick one corner as a toilet. Put a litter tray filled with hay in that corner.",
    leash: "Some rabbits can learn to wear a well-fitted harness for supervised outdoor time. Go slowly and never pull.",
  },
};

const NEW_BREED = {
  dog: {
    "hungarian-vizsla": {
      coat: "The short, single coat sheds lightly and needs little grooming, but a rubber mitt lifts loose hair and dirt.",
      weather: "The thin coat feels the cold quickly, so use a dog coat in winter. In summer keep exercise to early morning or evening.",
      mind: "Vizslas are very people-focused and can get anxious when left alone. Give company, scent work and retrieving games.",
      behave: "A bored or lonely Vizsla can become noisy or destructive. Exercise first, then train, and build calm alone time in small steps.",
      games: "Retrieving, find-it scent games and hide-and-seek suit the brain of a hunting dog.",
      outdoor: "Vizslas follow scents and can run far. Use a long line in open spaces until recall is reliable, and keep the microchip details current.",
      house: "Vizslas are clean and quick to learn, but young ones need frequent trips out, and excitement can cause accidents.",
      leash: "Vizslas are strong and eager. A front-clip harness and rewards for a loose leash help from the very first walk.",
    },
    "border-collie": {
      coat: "The medium, feathered coat picks up burrs and mats behind the ears, legs and tail. Brush it through to the skin.",
      weather: "Border Collies handle cool weather well but overheat during long exercise. In the heat, exercise early or late.",
      mind: "Border Collies need as much brain work as running. Without it, they invent their own jobs such as chasing or herding.",
      behave: "Herding instincts can show up as chasing cars, bikes or children, and nipping at heels. Redirect to a toy and reward calm.",
      games: "Agility, frisbee, find-it and learning new tricks keep a collie busy. Add 'settle' games so it learns to switch off.",
      outdoor: "Collies can fixate on moving things such as cars and bikes. Keep a leash near roads and teach 'look at me'.",
      house: "Border Collies learn routines very quickly. Stay consistent and toilet training is usually fast.",
      leash: "Collies may stare at or lunge toward movement. Reward calm looks at distractions and keep distance at first.",
    },
    "japanese-akita": {
      coat: "The thick double coat needs brushing through to the skin, with an undercoat rake. Never shave it.",
      weather: "The double coat makes heat hard for an Akita. Provide shade, cool floors and water, and avoid midday exercise.",
      mind: "Akitas are loyal, quiet and independent. They want calm company and gentle challenges, not constant action.",
      behave: "Akitas can be strong-willed and dominant with other dogs. Early socialisation, calm rules and professional help for any aggression matter a lot.",
      games: "Short tug games with rules, scent games and gentle trick training suit an Akita. Keep games calm and stop before the dog gets overexcited.",
      outdoor: "Akitas can be reactive to unfamiliar dogs. Keep a short, secure leash, avoid crowded dog areas and choose quiet routes.",
      house: "Akitas are naturally clean and often toilet train fast, but can be stubborn. Keep sessions short, calm and rewarding.",
      leash: "Akitas are large and strong. Start leash training early with a well-fitted harness and reward walking beside you.",
    },
  },
  cat: {
    persian: {
      coat: "The long, dense coat tangles and mats easily, so it needs daily combing with a wide-toothed comb.",
      weather: "The thick coat and flat face make heat hard for a Persian. Keep the home cool and shaded in summer.",
      mind: "Persians are calm and enjoy quiet company, soft toys and gentle play rather than constant activity.",
      behave: "Persians are gentle and rarely destructive. Hiding or litter box changes usually point to stress or a health issue.",
      games: "Gentle wand play, soft balls and puzzle feeders suit a calm Persian. Keep sessions short.",
      outdoor: "Persians are not suited to roaming outdoors. The long coat picks up dirt and burrs and the flat face overheats. Choose supervised time in an enclosed space.",
      house: "Long fur around the bottom can hold litter. Trim the area and use a low, easy-to-enter litter box.",
      leash: "A Persian is best kept indoors, but for supervised outdoor time use a snug harness in cool hours and keep it very short.",
    },
    himalayan: {
      coat: "The long coat mats easily, so it needs daily combing with a wide-toothed comb, especially behind the ears and under the belly.",
      weather: "The thick coat and flat face make heat hard for a Himalayan. Keep the home cool and shaded in summer.",
      mind: "Himalayans are sweet and calm. They enjoy quiet company, soft toys and gentle play.",
      behave: "Himalayans are gentle and rarely destructive. Hiding or litter box changes usually point to stress or a health issue.",
      games: "Gentle wand play, soft toys and puzzle feeders suit a Himalayan. Keep sessions short, and rest if breathing gets noisy.",
      outdoor: "Himalayans are not suited to roaming outdoors. The long coat picks up dirt and a flat face overheats. Choose supervised time in an enclosed space.",
      house: "Long fur around the bottom can hold litter. Trim the area and use a low, easy-to-enter litter box.",
      leash: "A Himalayan is best kept indoors, but for supervised outdoor time use a snug harness in cool hours and keep it very short.",
    },
  },
  rabbit: {
    "holland-lop": {
      coat: "The soft, dense coat needs weekly brushing, and more often when moulting. Check the fur around the bottom and ears.",
      weather: "Small rabbits lose heat fast in the cold and overheat in the sun. Keep the hutch indoors or well sheltered.",
      mind: "Holland Lops are playful and social. They enjoy company, toys to toss and things to explore.",
      behave: "A Holland Lop can become stubborn or nippy if handled roughly. Handle gently and ask the vet about neutering or spaying.",
      games: "Holland Lops like toss toys, cardboard castles and treat-hiding games.",
      outdoor: "A Holland Lop is small, so supervise any outdoor time closely, stay in the shade and cover the run on top.",
      house: "Holland Lops quickly learn the litter tray, especially with hay in it. Put trays in corners they already use.",
      leash: "A very small, well-fitted harness works for a Holland Lop. Short, supervised trials on a quiet lawn are enough.",
    },
    "newzealand-bunny": {
      coat: "The short, dense coat sheds heavily at times. Weekly brushing, and more in a moult, keeps it clean.",
      weather: "New Zealand rabbits are large and heavy-coated, so they overheat in warm weather. Offer cool tiles, shade and fresh water.",
      mind: "New Zealand rabbits are calm and easygoing, but still need space, company and chew toys to stay content.",
      behave: "New Zealand rabbits are docile, but boredom can lead to chewing. Give plenty of space, hay and things to chew.",
      games: "Large rabbits love big cardboard boxes, tunnels and a dig box. Give lots of room to run.",
      outdoor: "A large rabbit needs a big, secure run with shade, solid flooring and a cover on top.",
      house: "New Zealand rabbits are usually tidy. Use a large litter tray with hay at one end.",
      leash: "A large rabbit needs a sturdy, well-fitted harness. Short, supervised trials on a quiet lawn are enough.",
    },
  },
};
for (const sp of Object.keys(NEW_GENERIC)) Object.assign(EXTRA_GENERIC[sp], NEW_GENERIC[sp]);
for (const sp of Object.keys(NEW_BREED)) for (const [k, v] of Object.entries(NEW_BREED[sp])) Object.assign(EXTRA_BREED[sp][k], v);

/* ------------------------------------------------------------------ pages */
Object.assign(PAGES, {
  /* ---------------- Grooming ---------------- */
  brushing(sp, d) {
    const steps = {
      dog: [
        T("Step 1", "Get relaxed", "Pick a calm spot, have treats ready and check for tangles, ticks or sore skin."),
        T("Step 2", "Brush in sections", "Brush in the direction of hair growth, working from the legs up to the body."),
        T("Step 3", "Ease out mats gently", "Hold the fur at the base so it does not pull, then use fingers or a detangler. Never yank. Ask a groomer for stubborn mats."),
        T("Step 4", "Check the skin", "Look for redness, ticks, lumps and sore spots as you go."),
        T("Step 5", "Reward", "Finish with praise and a treat so grooming stays positive."),
      ],
      cat: [
        T("Step 1", "Pick a calm moment", "Brush when the cat is relaxed, such as after a meal or play."),
        T("Step 2", "Short, gentle strokes", "Start at the back and shoulders, where most cats enjoy it, following the direction of the fur."),
        T("Step 3", "Take care of the belly and tail", "Many cats dislike these areas. Go slowly and stop if the tail flicks or the ears flatten."),
        T("Step 4", "Tease out mats", "Hold the fur at the base and work with a comb. Never cut a mat close to the skin, because cat skin is thin."),
        T("Step 5", "Stop early and reward", "A short, happy session is better than a long, stressful one."),
      ],
      rabbit: [
        T("Step 1", "Sit on the floor", "Let the rabbit settle on a non-slip mat or towel. Never brush a rabbit that is on its back."),
        T("Step 2", "Soft brush with the fur", "Use a soft brush or a rubber grooming mitt with light, slow strokes."),
        T("Step 3", "Lift loose fur", "Gently pull away loose tufts during a moult. Rabbit skin is thin and tears easily."),
        T("Step 4", "Check the bottom and feet", "Look for droppings stuck to fur, sore hocks and mats."),
        T("Step 5", "Reward", "Offer a small leaf or herb when you finish."),
      ],
    }[sp];
    const tools = {
      dog: [I("Slicker brush", "Removes loose fur and light tangles.", "brush"), I("Undercoat rake", "Reaches the dense layer beneath the topcoat on double-coated dogs.", "brush"), I("Metal comb", "Checks that no knots are left, especially on feathering.", OK), I("Treats", "Keeps grooming a positive experience.", "cookie-outline")],
      cat: [I("Soft brush or comb", "Choose one that suits the coat length. Long coats need a wide-toothed comb.", "brush"), I("Grooming glove", "A gentle option for cats that dislike brushes.", "hand-heart-outline"), I("Treats", "Keeps grooming a positive experience.", "cookie-outline")],
      rabbit: [I("Soft brush", "Gentle on thin rabbit skin.", "brush"), I("Rubber grooming mitt", "Lifts loose fur during a moult.", "hand-heart-outline"), I("Small leaf or herb", "A reward that does not upset the gut.", "leaf")],
    }[sp];
    return [
      about(`Brushing ${PN}'s coat`, `Regular brushing removes loose fur, spreads natural oils, prevents mats and lets you check ${PN}'s skin. ${d.coat}`, [
        F("How often", d.brush, "calendar-check-outline"), F("Shedding season", sp === "rabbit" ? "Daily when moulting" : "Daily at peak", "weather-sunny"), F("Time", "5 – 15 minutes", "clock-outline"),
        F("Mat spots", sp === "dog" ? "Ears, legs, tail, belly" : sp === "cat" ? "Belly, armpits, behind ears" : "Bottom, belly, neck", "paw"),
      ]),
      timeline("How to brush", steps),
      list("Tools you'll need", tools),
      tip("Never shave to cool down 💡", `A coat protects against both heat and sunburn, and shaving can change the way it grows back. If ${PN} is too warm, brush out loose hair and keep the room cool instead.`),
    ];
  },

  nail_care(sp, d) {
    const every = { dog: "Every 3 – 4 weeks", cat: "Every 2 – 4 weeks", rabbit: "Every 4 – 6 weeks" }[sp];
    const steps = {
      dog: [
        T("Step 1", "Get comfortable", `Touch and hold ${PN}'s paws every day with treats, so trimming is not scary.`),
        T("Step 2", "Hold the paw gently", "Keep it steady and press softly on the pad to extend the nail."),
        T("Step 3", "Trim a little at a time", "Clip small bits at an angle. On light nails stay clear of the pink quick. On dark nails, trim thin slices until you see a dark dot in the centre."),
        T("Step 4", "Smooth the edges", "File or grind sharp edges so they do not scratch."),
        T("Step 5", "Reward", "Praise and a treat after every paw, even if you only do one at a time."),
      ],
      cat: [
        T("Step 1", "Get comfortable", `Touch ${PN}'s paws every day with treats, so trimming is not scary.`),
        T("Step 2", "Extend one claw", "Hold the paw and gently press the toe pad so the claw comes out."),
        T("Step 3", "Trim only the tip", "Clip the sharp, clear tip well before the pink quick. Use cat clippers."),
        T("Step 4", "One paw at a time", "Stop when the cat is tired of it. Finish another day."),
        T("Step 5", "Reward", "A treat after every paw keeps the next session easy."),
      ],
      rabbit: [
        T("Step 1", "Get ready", "Have a helper if possible. Wrap the rabbit snugly in a towel, with the feet free, to keep the spine safe."),
        T("Step 2", "Find the quick", "Pale nails show the pink quick. On dark nails, shine a torch from behind to see it."),
        T("Step 3", "Trim the tip", "Clip small bits with small animal clippers, well away from the quick."),
        T("Step 4", "Keep calm", "A struggling rabbit can injure its back. Stop and ask a vet to do it if it will not settle."),
        T("Step 5", "Reward", "Offer a leaf or herb afterwards."),
      ],
    }[sp];
    return [
      about("Keep those nails trimmed", `Long nails can be painful, change the way ${PN} moves and can even hurt the joints over time. ${sp === "cat" ? "Cats also scratch to keep claws healthy, so provide a sturdy scratching post." : sp === "rabbit" ? "Overgrown nails can curl or catch and may lead to sore feet." : "Check for clicking on the floor as a sign that nails are too long."}`, [
        F("How often", every, "calendar-check-outline"), F("Tools", sp === "cat" ? "Cat clippers" : sp === "rabbit" ? "Small animal clippers" : "Clippers or a grinder", "content-cut"),
        F("Sound test", sp === "dog" ? "Clicking on the floor = too long" : "Snagging on fabric = too long", "volume-high"), F("Don't forget", sp === "rabbit" ? "Hind feet too" : "Dewclaws", "paw"),
      ]),
      timeline("How to trim", steps),
      list("If you cut the quick", [
        I("Press styptic powder or cornstarch", "Apply to the nail tip and hold with gentle pressure.", OK),
        I("Wait a few minutes", "Bleeding usually stops quickly.", "clock-outline"),
        I("Call your vet", "If it keeps bleeding for more than 10 minutes or the nail looks torn.", WARN),
      ], { tone: "warn", intro: `It happens to everyone. Stay calm, because ${PN} will copy your mood.` }),
      tip("Not comfortable doing it? 💡", "There is no shame in asking a groomer or vet to do it. A quick trim every few weeks is better than overgrown nails."),
    ];
  },

  shedding_care(sp, d) {
    const helps = {
      dog: [
        I("Brush more often", "Daily brushing during shedding season takes out loose fur before it lands on the floor.", "brush"),
        I("Use an undercoat rake", "On double-coated dogs, go gently over the neck, chest and thighs where undercoat builds up.", "brush"),
        I("Bath and blow-dry", "A bath followed by a thorough blow-dry loosens a lot of dead undercoat.", "bathtub-outline"),
        I("Feed a quality diet", "A good diet supports skin and coat. Ask your vet before adding supplements.", "food-drumstick-outline"),
        I("Wash bedding weekly", "Keeps fur, dander and smells under control.", "bed-outline"),
        I("Rubber broom or lint roller", "Quick fixes for furniture and clothes.", "broom"),
      ],
      cat: [
        I("Brush regularly", "Brushing takes out loose hair before it is swallowed or lands on furniture.", "brush"),
        I("Reduce hairballs", "Regular brushing and plenty of water help. Ask the vet if hairballs are frequent.", "water-outline"),
        I("Feed a quality diet", "A good diet supports skin and coat. Ask your vet before adding supplements.", "food-drumstick-outline"),
        I("Wash bedding weekly", "Keeps hair, dander and smells under control.", "bed-outline"),
        I("Lint roller or rubber glove", "Quick fixes for sofas and clothes.", "broom"),
      ],
      rabbit: [
        I("Brush more during a moult", "Rabbits moult every few months. Daily brushing removes loose fur.", "brush"),
        I("Keep hay unlimited", "Fibre moves swallowed fur through the gut.", "grass"),
        I("Spot-clean only", "Do not bathe. Use a damp cloth for small spots.", "water-outline"),
        I("Clean the living area often", "Remove loose fur from bedding and the floor.", "broom"),
      ],
    }[sp];
    const abnormal = [
      I("Bald patches", "Fur missing in spots rather than thinning evenly.", WARN),
      I("Red, flaky or sore skin", "Could point to allergies, parasites or infection.", WARN),
      I("Constant scratching or licking", "Itching that does not settle.", WARN),
      I("Dull, brittle coat", "May signal a nutrition or health problem.", WARN),
      I("Heavy shedding out of season", "Sudden changes can be linked to stress or hormone problems.", WARN),
    ];
    if (sp === "rabbit") abnormal.push(I("Fewer droppings during a moult", "Swallowed fur can slow the gut. Treat this as an emergency if it lasts 8 – 12 hours.", WARN));
    return [
      about("Manage loose fur", `Shedding is normal, and heavier at seasonal changes. ${d.coat}`, [
        F("Heavy seasons", sp === "rabbit" ? "A few times a year" : "Spring & autumn", "weather-sunny"), F("Brushing", "Daily at peak", "brush"), F("Diet", "Quality food supports coat", "food-variant"), F("Cleaning", "Frequent vacuuming", "broom"),
      ]),
      list("What helps", helps),
      list("When shedding isn't normal", abnormal, { tone: "warn", intro: "See your vet if you notice any of these:" }),
      tip("Don't shave to reduce shedding 💡", `Shaving does not stop shedding and can harm the coat. Regular brushing is a much better solution for ${PN}.`),
    ];
  },

  /* ---------------- Health & Wellness ---------------- */
  exercise_needs(sp, d) {
    const stages = {
      dog: [
        T("Puppy (2 – 6 months)", "Short & gentle", "About 5 minutes of structured exercise per month of age, twice a day, plus free play. Avoid forced running, long jumps and lots of stairs."),
        T("Junior (6 – 18 months)", "Build stamina slowly", "Increase gradually. Skip long, hard runs until the growth plates close, which is later in large breeds."),
        T("Adult (1.5 – 7 years)", "Full energy", `A mix of walking, running, games and training that matches ${PN}'s daily total.`),
        T("Senior (7+ years)", "Gentle & regular", "Shorter, more frequent outings. Slow walks and easy games protect stiff joints."),
      ],
      cat: [
        T("Kitten (up to 1 year)", "Lots of short bursts", "Many short play sessions a day. Kittens tire quickly and nap between them."),
        T("Adult (1 – 10 years)", "Daily hunting play", `Aim for ${d.exercise} spread across the day, with a wand toy and climbing.`),
        T("Senior (10+ years)", "Gentle & regular", "Slower games, low perches and soft toys. Watch for stiffness."),
      ],
      rabbit: [
        T("Young (under 1 year)", "Space to zoom", "Plenty of safe free-roam time. Young rabbits are bursting with energy."),
        T("Adult (1 – 5 years)", "Daily exercise", `Aim for ${d.exercise} out of the pen, with room to run, jump and stretch out.`),
        T("Senior (5+ years)", "Easy and safe", "Low ramps, soft floors and gentle exploring. Watch for stiffness."),
      ],
    }[sp];
    const ideas = {
      dog: [I("Fetch & retrieve", "Use soft toys in a safe open space.", "tennis-ball"), I("Scent games", "Hide treats around the house or garden and let the nose do the work.", "magnify"), I("Training sessions", "Short obedience or trick practice tires the mind and body.", "school-outline"), I("Easy trail walks", "New smells and surfaces keep walks exciting.", "walk"), I("Swimming (where safe)", "A low-impact workout. Rinse and dry the coat and ears after.", "swim")],
      cat: [I("Wand toy play", "Short, active sessions with a stalk, chase and catch.", "tennis-ball"), I("Climbing", "Cat trees and shelves give safe height.", "stairs-up"), I("Food puzzles", "Make mealtime a hunt.", "puzzle-outline"), I("Boxes and tunnels", "A cardboard box is a great toy.", "package-variant")],
      rabbit: [I("Free-roam time", "A rabbit-proofed room or a large, safe pen.", "run"), I("Tunnels and platforms", "Encourages hopping and exploring.", "stairs-up"), I("Dig box", "A box of shredded paper for safe digging.", "shovel"), I("Chew toys", "Willow or apple wood keeps teeth and mind busy.", "tree-outline")],
    }[sp];
    return [
      about(`How much exercise does ${PN} need?`, `Exercise keeps the weight healthy, the joints moving and the mind busy. ${sp === "dog" ? "A healthy adult dog needs regular activity spread across walks, play and training." : sp === "cat" ? "Cats need short bursts of play that copy hunting." : "Rabbits need to stretch their legs, hop and explore every day."}`, [
        F("Daily total", d.exercise, "clock-outline"), F(sp === "dog" ? "Walks" : "Sessions", sp === "dog" ? "2 – 3 per day" : sp === "cat" ? "2 – 3 per day" : "Morning and evening", "walk"), F("Play", sp === "dog" ? "Fetch, tug & games" : sp === "cat" ? "Wand toys & climbing" : "Tunnels & chewing", "tennis-ball"), F("Weather", "Cool hours in heat", "weather-sunny"),
      ]),
      timeline(`Exercise through ${PN}'s life`, stages),
      list(`Fun ways to keep ${PN} active`, ideas),
      list("Slow down if you notice", [
        I("Heavy panting that does not settle", "Rest in a cool, shaded place and offer fresh water.", WARN),
        I("Limping or stiffness", "Stop the activity. If it lasts more than a day, see your vet.", WARN),
        I("Reluctance to move", "Lagging behind or lying down can mean pain or tiredness.", WARN),
      ], { tone: "danger" }),
      tip("Did You Know? 💡", d.weather),
    ];
  },

  mental_wellness(sp, d) {
    const boosters = {
      dog: [I("Puzzle feeders & snuffle mats", "Make mealtime a brain game instead of a 30-second gulp.", "puzzle-outline"), I("Short training sessions", "Practise a new trick for 5 – 10 minutes.", "school-outline"), I("Scent games", "Hide treats or a favourite toy and let the nose find them.", "magnify"), I("Toy rotation", "Swap toys every few days so they always feel new.", "tennis-ball"), I("Social time", "Meet friendly dogs and people regularly.", "account-heart-outline")],
      cat: [I("Window perch", "Watching birds and traffic is great enrichment.", "window-open-variant"), I("Food puzzles", "Hide food in puzzle toys or around the home.", "puzzle-outline"), I("Daily play", "A wand toy session builds confidence.", "tennis-ball"), I("Vertical space", "Shelves and cat trees make a cat feel safe.", "stairs-up"), I("Toy rotation", "Swap toys every few days so they always feel new.", "tennis-ball")],
      rabbit: [I("Hiding places", "Boxes and tunnels help a rabbit feel safe.", "package-variant"), I("Foraging", "Hide greens or pellets in hay or a toy.", "leaf"), I("Things to chew & dig", "Willow, cardboard and a dig box.", "tree-outline"), I("Company", "Time with you, or a bonded rabbit friend if the vet agrees.", "account-heart-outline"), I("Toy rotation", "Swap toys every few days.", "tennis-ball")],
    }[sp];
    const stress = [
      I(sp === "dog" ? "Barking, whining or howling" : sp === "cat" ? "Over-grooming or hiding" : "Thumping, freezing or hiding", "Especially when left alone or without a clear reason.", WARN),
      I(sp === "rabbit" ? "Chewing bars or over-grooming" : "Destructive chewing, scratching or digging", "Often a sign of pent-up energy or worry.", WARN),
      I("Pacing or restlessness", "Not settling, even when it is not hot.", WARN),
      I("Withdrawing", `A normally friendly pet pulling away deserves attention.`, WARN),
      I("Change in appetite", "Eating much less or much more than usual.", WARN),
    ];
    return [
      about(`A happy mind, a happy ${PN}`, `${d.mind} Mental exercise matters as much as physical exercise.`, [
        F("Company", "Needs daily attention", "account-heart-outline"), F("Time alone", sp === "dog" ? "Under 4 – 5 hours" : "Keep it predictable", "clock-outline"), F("Brain games", "10 – 15 min daily", "puzzle-outline"), F("Sleep", sp === "dog" ? "12 – 14 hours" : sp === "cat" ? "12 – 16 hours" : "8 – 12 hours", "sleep"),
      ]),
      list("Daily mind boosters", boosters),
      list("Signs of stress or boredom", stress, { tone: "warn" }),
      timeline("Build a calm routine", [
        T("Step 1", "Keep a steady schedule", `Feed, play and rest at similar times so ${PN} knows what to expect.`),
        T("Step 2", "Give a safe spot", "A cosy bed or hide box that is never disturbed."),
        T("Step 3", "Practise short absences", "Leave for a few minutes and return calmly. Slowly increase the time."),
        T("Step 4", "Reward calm behaviour", "Praise and treat quiet, relaxed moments, not just tricks."),
      ]),
      tip("Did You Know? 💡", `If stress signs last for weeks, talk to your vet${sp === "dog" ? " or a certified trainer" : sp === "cat" ? " or a cat behaviourist" : ""}. Pain or illness can look like a mood problem.`),
    ];
  },

  signs_to_watch(sp, d) {
    const extra = {
      dog: [I("Bloated, hard belly", "With unproductive retching or restlessness. Possible bloat is life-threatening.", WARN), I("Heatstroke", "Heavy panting, drooling, weakness or a very hot body. Cool gently and go to the vet.", WARN)],
      cat: [I("Straining to pee, or no pee", "A blocked urinary tract can be fatal within a day, most often in male cats.", WARN), I("Open-mouth breathing", "Cats rarely pant. This is an emergency.", WARN)],
      rabbit: [I("No food or droppings for 8 – 12 hours", "Gut stasis is an emergency in rabbits.", WARN), I("Head tilt, rolling or sudden weakness", "Needs a rabbit-savvy vet quickly.", WARN)],
    }[sp];
    const vitals = {
      dog: [F("Temperature", "38.1 – 39.2 °C", "thermometer"), F("Resting breathing", "15 – 30 per minute", "heart-pulse"), F("Heart rate", "60 – 140 bpm", "heart-pulse"), F("Gums", "Pink and moist", "tooth-outline")],
      cat: [F("Temperature", "38.1 – 39.2 °C", "thermometer"), F("Resting breathing", "20 – 30 per minute", "heart-pulse"), F("Heart rate", "140 – 220 bpm", "heart-pulse"), F("Gums", "Pink and moist", "tooth-outline")],
      rabbit: [F("Temperature", "38.5 – 40 °C", "thermometer"), F("Resting breathing", "30 – 60 per minute", "heart-pulse"), F("Heart rate", "180 – 250 bpm", "heart-pulse"), F("Droppings", "Plenty, round and firm", "stomach")],
    }[sp];
    return [
      about("Spot illness early", `Pets instinctively hide pain, so small changes are often the first clue that something is wrong. You know ${PN} best. If ${PN} just does not seem like the usual self, trust your instinct and check in with your vet.`, [
        F("Appetite", "Sudden change", "food-apple-outline"), F("Energy", "Unusual tiredness", "sleep"), F("Bathroom", sp === "cat" ? "Litter box changes" : "Diarrhoea or straining", "water-outline"), F("Behaviour", "Hiding or irritability", "emoticon-sad-outline"),
      ]),
      list("See your vet soon if", [
        I("Not eating for 24 hours", sp === "rabbit" ? "For a rabbit, even 8 – 12 hours is an emergency." : "Or a sudden big change in how much is eaten or drunk.", "food-apple-outline"),
        I("Vomiting or diarrhoea", "Lasting more than a day, or with blood.", "water-outline"),
        I("Limping or stiffness", "Lasting more than a day or getting worse.", "bone"),
        I("Itching, redness or hair loss", "Constant scratching, sore patches or a bad skin smell.", WARN),
        I("Head shaking or ear odour", "May point to an ear infection.", "ear-hearing"),
        I("Cloudy eyes or discharge", "Squinting, redness or bumping into things.", "eye-outline"),
        I("Bad breath, drooling or bleeding gums", "Often a dental problem.", "tooth-outline"),
        I("New lump or weight change", "Any new or growing lump, or unexplained weight loss or gain.", "scale-bathroom"),
      ], { tone: "warn" }),
      list("Emergency: go to the vet right away", [
        I("Difficulty breathing", "Laboured breathing, or pale or blue gums."),
        I("Collapse or seizure", "Sudden weakness, fainting or fits."),
        ...extra,
        I("Poison or toxin", "Chocolate, grapes or raisins, xylitol, human medicines or rat poison."),
        I("Heavy bleeding or injury", "Accidents, deep wounds or a suspected broken bone."),
      ], { tone: "danger" }),
      about(`Know ${PN}'s normal`, `Check these while ${PN} is relaxed so you know the baseline. Changes from normal are easier to notice.`, vitals),
      tip(`Keep ${PN}'s emergency info ready 🚑`, `Save your vet's number and keep ${PN}'s Emergency Card handy so anyone caring for ${PN} can act fast.`, { label: "Open Emergency Card", route: "/EmergencyCardScreen" }),
    ];
  },

  vet_check_ups(sp, d) {
    const stages = {
      dog: [T("8 – 16 weeks", "Puppy visits", "Every 3 – 4 weeks for vaccines, deworming and a growth check."), T("6 months", "Growth & joint check", "Discuss neutering or spaying, diet changes and joint health."), T("1 – 7 years", "Yearly wellness exam", "Full exam, boosters, parasite prevention and a dental check."), T("7+ years", "Senior screening", "Twice a year, often with blood and urine tests to catch problems early.")],
      cat: [T("8 – 16 weeks", "Kitten visits", "Every 3 – 4 weeks for vaccines, deworming and a growth check."), T("6 months", "Growth check", "Discuss neutering or spaying and diet changes."), T("1 – 10 years", "Yearly wellness exam", "Full exam, boosters, parasite prevention and a dental check."), T("10+ years", "Senior screening", "Twice a year, often with blood and urine tests to catch kidney and thyroid problems early.")],
      rabbit: [T("Young", "First check", "Weight, teeth, ears and diet advice from a rabbit-savvy vet."), T("6 months", "Neutering or spaying talk", "Discuss the right time with your vet."), T("1 – 5 years", "Yearly wellness exam", "Teeth, weight, ears, feet and gut health, plus vaccines where available."), T("5+ years", "Senior screening", "Twice a year, with extra attention to teeth, joints and kidneys.")],
    }[sp];
    return [
      about("Why regular check-ups matter", `Many health problems show no obvious signs until they are advanced. Regular vet visits catch issues early, keep vaccines and parasite protection up to date, and build a record of what is normal for ${PN}. Ask the vet about ${names(d)}.`, [
        F("Adults", "Once a year", "calendar-check-outline"), F("Senior", sp === "dog" ? "Every 6 months (7+)" : sp === "cat" ? "Every 6 months (10+)" : "Every 6 months (5+)", "clock-outline"), F("Bring", "Health records", "clipboard-check-outline"), F("Reminder", "Add a task", "bell-outline"),
      ]),
      timeline(`Check-ups through ${PN}'s life`, stages),
      list("What a check-up covers", [
        I("Physical exam", "Weight, heart and lungs, joints, skin, coat, eyes and ears.", "stethoscope"),
        I("Vaccines & boosters", `Reviewing what is due and updating ${PN}'s records.`, "needle"),
        I("Parasite prevention", sp === "rabbit" ? "Fleas, mites and other parasites." : "Fleas, ticks and regular deworming.", "shield-check-outline"),
        I("Dental check", sp === "rabbit" ? "Looking for overgrown teeth and sore spots." : "Looking for plaque, tartar and gum disease.", "tooth-outline"),
        I("Blood & urine tests", "Recommended for seniors or if your vet suspects a problem.", "water-outline"),
        I("Diet & weight advice", "Portion sizes and the right food for age and activity.", "food-apple-outline"),
      ]),
      list("Before you go", [
        I(`Bring ${PN}'s PetCard and records`, "Vaccination history and past reports help the vet.", "clipboard-check-outline"),
        I("Note any changes", "Appetite, energy, toileting, limping or behaviour. Jot them down so nothing is forgotten.", "pencil-outline"),
        I("List medicines & supplements", "Include how long each has been given.", "pill"),
        I("Ask about fasting", "Some blood tests need an empty stomach. Check with the clinic first.", "clock-outline"),
        I("Keep travel safe", sp === "dog" ? "Use a leash or carrier and bring a few treats." : "Use a secure carrier and bring a familiar blanket.", "paw"),
      ], { tone: "warn" }),
      tip("Stay on schedule 📅", `Log every visit in ${PN}'s health records and add a reminder for the next one, so check-ups never slip by.`, { label: "Open Health Records", route: "/HealthRecordScreen" }),
    ];
  },

  /* ---------------- Safety ---------------- */
  home_safety(sp, d) {
    const rooms = {
      dog: [
        I("Kitchen", "Use bins with lids, keep food off counters and store chocolate, onions and sweeteners in closed cupboards.", "food-variant"),
        I("Living room", "Tuck away cables, and keep socks, small toys and remote batteries out of reach. They can cause choking or blockages.", "sofa-outline"),
        I("Bathroom", "Close the toilet lid and store cleaners, razors and medicines in a cabinet that cannot be opened.", "shower-head"),
        I("Balcony & garden", "Secure railings and gates, and keep fertilisers, pesticides and slug pellets locked away.", "fence"),
        I("Stairs", "Use a gate for puppies and older dogs to prevent falls.", "stairs"),
      ],
      cat: [
        I("Windows & balcony", "Fit secure screens or nets. Cats can fall from open windows and balconies.", "window-open-variant"),
        I("Kitchen", "Keep hot hobs off, bins closed and food off counters.", "food-variant"),
        I("Living room", "Hide cables, string, ribbon and elastic bands. Swallowed string is an emergency.", "sofa-outline"),
        I("Laundry", "Check the washer and dryer before closing the door. Cats love to nap inside.", "washing-machine"),
        I("Plants", "Remove lilies and other toxic plants.", "flower-outline"),
      ],
      rabbit: [
        I("Cables & wires", "Cover or lift every cable. Rabbits chew everything.", "power-plug-outline"),
        I("Floors", "Use rugs or mats on slippery floors. Rabbits can hurt their legs and back.", "floor-plan"),
        I("Doors & gaps", "Block gaps behind furniture and check doors before closing them.", "door"),
        I("Plants", "Remove toxic houseplants and anything that looks chewable.", "flower-outline"),
        I("Other pets & children", "Supervise all contact. Rabbits are prey animals and are easily frightened.", "paw"),
      ],
    }[sp];
    return [
      about("Pet-proof your home", `${sp === "dog" ? "Dogs explore the world with their mouths" : sp === "cat" ? "Cats are curious climbers and explorers" : "Rabbits chew, dig and squeeze into small spaces"}, so anything within reach can become a toy. A quick walk-through of each room now can prevent an emergency later for ${PN}.`, [
        F("Cables", "Hide or cover", "power-plug-outline"), F("Bins", "Closed lids", "trash-can-outline"), F("Medicines", "Locked away", "pill"), F("Plants", "Check if toxic", "flower-outline"),
      ]),
      list("Room by room", rooms, { tone: "warn" }),
      list("Quick checklist", [
        I("ID tag and microchip", "Keep phone numbers up to date.", OK),
        I("Latched doors and windows", "Many pets slip out in the seconds a door is open.", OK),
        I(sp === "dog" ? "Plenty of chew toys" : sp === "cat" ? "A scratching post" : "Plenty of chew toys", "Gives something safe to chew or scratch.", OK),
        I("A safe resting spot", "A quiet bed away from the hustle.", OK),
      ]),
      tip("Be prepared 🚑", `Keep your vet's number and ${PN}'s Emergency Card where everyone at home can find them quickly.`, { label: "Open Emergency Card", route: "/EmergencyCardScreen" }),
    ];
  },

  outdoor_safety(sp, d) {
    const good = {
      dog: [I("ID tag with your phone number", "And keep the microchip details up to date.", OK), I("Leash in busy places", "Even well-trained dogs can bolt when startled.", OK), I("Ask before dogs say hello", "Not every dog is friendly. Check with the other owner first.", OK), I("Pack water and bags", "Offer water regularly, especially in warm weather.", OK), I("Choose cool hours", "Early morning and evening are kinder, especially for thick coats.", OK), I("Check after walks", "Look for ticks, burrs, cuts and sore paws.", OK)],
      cat: [I("ID tag and microchip", "Keep the details up to date.", OK), I("Enclosed outdoor space", "A catio or secure garden is much safer than free roaming.", OK), I("Supervise outdoor time", "Stay close and watch for other animals.", OK), I("Fresh water and shade", "Always available outdoors.", OK), I("Check after outdoor time", "Look for ticks, burrs, cuts and sore paws.", OK)],
      rabbit: [I("Secure run with a cover", "Protects from predators such as cats, birds and foxes.", OK), I("Shade and cool shelter", "Rabbits overheat quickly in the sun.", OK), I("Fresh water and hay", "Always available outdoors.", OK), I("Chemical-free grass", "Do not use lawns treated with pesticides or fertiliser.", OK), I("Check after outdoor time", "Look for ticks, wounds and sore feet.", OK)],
    }[sp];
    const bad = {
      dog: [I("Hot pavement", "Press the back of your hand on it for 5 seconds. If it is too hot for you, it is too hot for paws.", WARN), I("Stagnant water & puddles", "Can carry bacteria such as leptospirosis, or harmful algae.", WARN), I("Other dogs and strays", "Keep a safe distance from unfamiliar or unvaccinated dogs.", WARN), I("Litter and poison baits", "Do not let your dog eat things off the ground.", WARN), I("Traffic", `Keep ${PN} on the side away from the road.`, WARN)],
      cat: [I("Traffic", "The biggest danger for cats that roam.", WARN), I("Other animals", "Fights can cause wounds and spread disease.", WARN), I("Toxic plants and chemicals", "Lilies, antifreeze and pesticides are very dangerous.", WARN), I("Heat", "Hot cars and sheds can be deadly.", WARN)],
      rabbit: [I("Predators", "Even a secure-looking garden can be reached by cats, foxes and birds of prey.", WARN), I("Heat", "Rabbits can suffer heatstroke in warm weather.", WARN), I("Flies and insects", "Check the bottom daily in warm weather.", WARN), I("Toxic plants", "Check the garden before letting the rabbit out.", WARN)],
    }[sp];
    return [
      about(sp === "dog" ? "Walks & outdoor tips" : "Outdoor time", `${d.outdoor}`, [
        F("ID", "Tag + microchip", "card-account-details-outline"), F(sp === "dog" ? "Leash" : "Space", sp === "dog" ? "Always in public" : sp === "cat" ? "Enclosed or supervised" : "Secure, shaded run", "shield-check-outline"), F("Water", "Always available", "cup-water"), F("Check", "After every outing", "paw"),
      ]),
      list(sp === "dog" ? "Walk safety" : "Stay safe outside", good),
      list("Watch out for", bad, { tone: "warn" }),
      tip(`If ${PN} gets lost 🔎`, `Search nearby, tell neighbours and share the details quickly. ${PN}'s Digital PetCard has everything someone needs to contact you.`, { label: "Open Digital PetCard", route: "/DigitalPetCardScreen" }),
    ];
  },

  toxic_items(sp, d) {
    const foods = {
      dog: [I("Chocolate & cocoa", "Darker chocolate is more dangerous.", "skull-outline"), I("Grapes & raisins", "Can cause kidney failure.", "skull-outline"), I("Onion, garlic & chives", "Damage red blood cells.", "skull-outline"), I("Xylitol", "Found in sugar-free gum, sweets and some peanut butters.", "skull-outline"), I("Macadamia nuts", "Cause weakness, vomiting and tremors.", "skull-outline"), I("Alcohol, caffeine & raw yeast dough", "All toxic, even in small amounts.", "skull-outline"), I("Cooked bones", "Choking and blockage hazards.", "bone")],
      cat: [I("Onion, garlic & chives", "Damage red blood cells.", "skull-outline"), I("Chocolate & caffeine", "Toxic to cats.", "skull-outline"), I("Grapes & raisins", "Can cause kidney failure.", "skull-outline"), I("Xylitol", "Found in sugar-free gum and sweets.", "skull-outline"), I("Alcohol & raw yeast dough", "Dangerous even in small amounts.", "skull-outline"), I("Raw fish and cooked bones", "Can cause illness or injury.", WARN)],
      rabbit: [I("Chocolate & sweets", "Toxic and far too sugary.", "skull-outline"), I("Onion, garlic & chives", "Harmful to rabbits.", "skull-outline"), I("Avocado", "Toxic to rabbits.", "skull-outline"), I("Rhubarb & potato", "Not safe for rabbits.", "skull-outline"), I("Bread, biscuits & cereal", "Starchy foods upset the gut.", WARN), I("Nuts and seeds", "Too fatty and a choking risk.", WARN)],
    }[sp];
    const house = {
      dog: [I("Human medicines", "Painkillers like paracetamol and ibuprofen are dangerous for dogs.", "pill"), I("Rodent poison & pesticides", "Keep them where they can never be reached.", WARN), I("Antifreeze & car fluids", "Sweet-tasting and extremely toxic.", WARN), I("Cleaning products & bleach", "Store them behind closed doors.", "spray-bottle"), I("Batteries & coins", "Can burn or poison, and cause blockages.", WARN), I("Cigarettes & vapes", "Nicotine is highly toxic.", WARN)],
      cat: [I("Human medicines", "Painkillers like paracetamol and ibuprofen are dangerous for cats.", "pill"), I("Dog flea products", "Some contain chemicals that are deadly to cats. Never use them.", WARN), I("Essential oils & diffusers", "Many are toxic to cats, including tea tree oil.", WARN), I("Antifreeze & cleaners", "Extremely toxic. Store them securely.", "spray-bottle"), I("Rodent poison", "Keep it where cats can never reach it.", WARN), I("String, ribbon & tinsel", "Swallowed string can block the gut.", WARN)],
      rabbit: [I("Cables & wires", "Chewing can cause burns and shocks.", "power-plug-outline"), I("Cleaning products & air fresheners", "Rabbit lungs are sensitive.", "spray-bottle"), I("Rodent poison & pesticides", "Keep them where a rabbit can never reach.", WARN), I("Human medicines", "Never give human medicines.", "pill"), I("Smoke, candles & scented sprays", "Can irritate the lungs.", WARN)],
    }[sp];
    const plants = {
      dog: [I("Sago palm", "Very dangerous. All parts are toxic, especially the seeds.", "flower-outline"), I("Oleander", "Can seriously affect the heart.", "flower-outline"), I("Azalea & rhododendron", "Cause vomiting, drooling and weakness.", "flower-outline"), I("Tulip & daffodil bulbs", "The bulbs are the most toxic part.", "flower-outline"), I("Lily of the valley", "Can cause heart rhythm problems.", "flower-outline")],
      cat: [I("Lilies", "Every part of the plant, even the pollen, can cause kidney failure.", "flower-outline"), I("Sago palm", "Very dangerous. All parts are toxic.", "flower-outline"), I("Oleander", "Can seriously affect the heart.", "flower-outline"), I("Tulip & daffodil bulbs", "The bulbs are the most toxic part.", "flower-outline"), I("Azalea & rhododendron", "Cause vomiting and weakness.", "flower-outline")],
      rabbit: [I("Foxglove & lily of the valley", "Affect the heart.", "flower-outline"), I("Oleander", "Can seriously affect the heart.", "flower-outline"), I("Buttercup", "Irritates the mouth and gut.", "flower-outline"), I("Ivy & yew", "Toxic if eaten.", "flower-outline"), I("Rhubarb leaves", "Toxic to rabbits.", "flower-outline")],
    }[sp];
    return [
      about("Things to keep away", `Many everyday foods, plants and household items are poisonous to ${sp === "dog" ? "dogs" : sp === "cat" ? "cats" : "rabbits"}. Keep them out of ${PN}'s reach, and know what to do if ${PN} gets into something.`, [
        F("Call", "Your vet right away", "phone"), F("Don't", "Make vomit unless told", "close-circle-outline"), F("Bring", "The packaging", "package-variant-closed"), F("Act", "Fast, don't wait", "timer-outline"),
      ]),
      list("Foods", foods, { tone: "danger" }),
      list("Around the house", house, { tone: "warn" }),
      list("Plants", plants, { tone: "warn" }),
      tip("If you suspect poisoning 🚨", `Call your vet or the nearest emergency clinic immediately. Tell them what ${PN} ate, how much and when. Keep the packaging, and do not wait for symptoms to appear.`, { label: "Open Emergency Card", route: "/EmergencyCardScreen" }),
    ];
  },

  weather_safety(sp, d) {
    const hot = {
      dog: [I("Walk early or late", "Avoid the midday sun and hot pavement.", "weather-sunny"), I("Shade and fresh water", "Always available, indoors and out.", "cup-water"), I("Never in a parked car", "It can turn deadly within minutes.", "car"), I("Know the signs of heatstroke", "Heavy panting, drooling, bright red gums, weakness or collapse. Cool with lukewarm water and go straight to a vet.", WARN)],
      cat: [I("Cool, shaded spots", "Give access to tiles, shade and fresh water.", "weather-sunny"), I("Never in a parked car", "It can turn deadly within minutes.", "car"), I("Keep windows secure", "Cats sunbathe on sills, and can fall.", "window-open-variant"), I("Know the signs of heatstroke", "Open-mouth breathing, drooling, weakness or collapse. Cool gently and go straight to a vet.", WARN)],
      rabbit: [I("Keep it cool", "Rabbits are in danger above about 28 °C. Use shade, fans (not blowing directly) and cool tiles.", "weather-sunny"), I("Frozen bottles", "A wrapped frozen bottle gives something to lean on.", "snowflake"), I("Fresh water always", "Check bowls several times a day.", "cup-water"), I("Know the signs of heatstroke", "Panting, wet nose, drooling, lying stretched out and limp. Cool gently with damp ears and go straight to a vet.", WARN)],
    }[sp];
    const cold = {
      dog: [I("Keep outings shorter in extreme cold", "Watch for shivering or lifting paws.", "snowflake"), I("Dry after walks", "A wet coat loses heat quickly.", OK), I("Wipe the paws", "Removes ice, salt and chemicals that irritate skin.", OK), I("Warm, draught-free bed", "Raised slightly off a cold floor.", "bed-outline")],
      cat: [I("Keep cats indoors in the cold", "Cats seek warm places, including car engines.", "snowflake"), I("Check the car", "Bang the bonnet before starting in winter.", "car"), I("Warm, draught-free bed", "Raised slightly off a cold floor.", "bed-outline"), I("Fresh water", "Check that outdoor water has not frozen.", "cup-water")],
      rabbit: [I("Draught-free, dry shelter", "Wet and cold together are the real danger.", "snowflake"), I("Extra bedding", "Plenty of hay and straw for warmth.", "bed-outline"), I("Check water", "Make sure it has not frozen.", "cup-water"), I("Move indoors in extreme cold", "A garage or shed is better than an open hutch.", "home-outline")],
    }[sp];
    const rain = {
      dog: [I("Dry fully", "A damp coat can lead to fungus and hot spots. Check between toes and ears.", WARN), I("More ticks and fleas", "Keep parasite prevention up to date.", WARN), I("Avoid puddles and floodwater", "They can carry bacteria such as leptospirosis. Ask your vet about vaccination.", WARN)],
      cat: [I("Dry fully", "A damp coat can cause skin problems. Towel dry.", WARN), I("More fleas and ticks", "Keep parasite prevention up to date.", WARN), I("Thunder and storms", "Give a quiet hiding place.", WARN)],
      rabbit: [I("Keep the hutch dry", "Damp bedding causes skin problems and flystrike risk.", WARN), I("Avoid wet grass", "Do not let a rabbit sit in wet grass for long.", WARN), I("Thunder and storms", "Rabbits can get very scared. Cover the sides of the hutch and give a hiding place.", WARN)],
    }[sp];
    return [
      about("Hot, cold & rainy care", `${d.weather} Adjust ${PN}'s routine, water and rest to the weather to keep everyone comfortable all year.`, [
        F("Hot days", sp === "rabbit" ? "Keep cool, shaded" : "Avoid 11 AM – 4 PM", "weather-sunny"), F("Cold days", sp === "dog" ? "Dry off after outings" : "Warm and dry bed", "snowflake"), F("Rainy days", "Dry paws & coat", "weather-rainy"), F("Humid days", "Cooling is harder", "water-outline"),
      ]),
      list("Hot weather", hot, { tone: "danger" }),
      list("Cold weather", cold),
      list("Rainy & monsoon season", rain, { tone: "warn" }),
      tip("Did You Know? 💡", sp === "dog" ? "Dogs cool down mostly by panting and through their paws, so in humid weather they overheat faster than you think. When in doubt, keep your dog indoors with a fan or AC." : sp === "cat" ? "Cats hide discomfort well. Give choices, such as a warm spot and a cool spot, and let the cat choose." : "Rabbits cannot sweat or pant well, so heat is dangerous. Check on a rabbit often in hot weather.") ,
    ];
  },

  /* ---------------- Training ---------------- */
  behavior_tips(sp, d) {
    const problems = {
      dog: [
        I("Jumping on people", `Turn away and ignore the jumping until all four paws are on the floor, then reward. Ask visitors to do the same.`, WARN),
        I("Mouthing & nipping", "Offer a toy instead and pause play when teeth touch skin.", WARN),
        I("Excessive barking", "Find the trigger, teach a 'Quiet' cue and reward silence. Shouting only joins in.", WARN),
        I("Chewing furniture", "Provide plenty of chew toys, puppy-proof your home and redirect to the right item.", WARN),
        I("Digging", "Give more exercise and a spot where digging is allowed.", WARN),
        I("Separation anxiety", "Practise short absences, keep goodbyes calm and leave a puzzle toy. For severe cases ask your vet.", WARN),
      ],
      cat: [
        I("Scratching furniture", "Provide sturdy scratching posts near the furniture and reward use. Never punish.", WARN),
        I("Biting or scratching hands", "Stop play and use toys instead of hands.", WARN),
        I("Night-time zooming", "Play hard in the evening and feed afterwards.", WARN),
        I("Litter box problems", "Rule out a medical cause first, then check cleanliness and position.", WARN),
        I("Excessive meowing", "Check for hunger, boredom or illness. Do not reward demand calls.", WARN),
      ],
      rabbit: [
        I("Chewing furniture and cables", "Provide chew toys and rabbit-proof the area.", WARN),
        I("Digging carpet", "Give a dig box and a spot where digging is allowed.", WARN),
        I("Nipping or lunging", "Back off and give space. Fear or hormones are often the cause. Ask the vet about neutering or spaying.", WARN),
        I("Thumping", "A warning of fear or danger. Look for the cause.", WARN),
        I("Spraying or messy toilet habits", "Neutering or spaying often helps. Clean with an enzyme cleaner.", WARN),
      ],
    }[sp];
    return [
      about("Solve common behaviours", `${d.behave} Meeting ${PN}'s needs and rewarding what you like works better than punishing what you do not.`, [
        F("Common cause", "Boredom or extra energy", "emoticon-sad-outline"), F("First fix", sp === "dog" ? "Exercise + training" : "Play + enrichment", "run"), F("Method", "Reward good, redirect bad", "star-outline"), F("Timeline", "Weeks, not days", "calendar-clock"),
      ]),
      list("Common problems & what to try", problems, { tone: "warn" }),
      list("Golden rules", [
        I("Be consistent", "Everyone in the family should use the same rules and cues.", OK),
        I("Catch them being good", "Reward calm and quiet behaviour, not only tricks.", OK),
        I("Manage the environment", "Remove temptations while learning.", OK),
      ]),
      tip("Never punish 💡", "Scolding and physical punishment damage trust and can make problems worse. If you see aggression, or behaviour that is not improving, talk to your vet or a qualified behaviourist."),
    ];
  },

  fun_games(sp, d) {
    const games = {
      dog: [I("Fetch with 'Drop it'", "Trade the ball for a treat so your dog learns to let go happily.", "tennis-ball"), I("Hide & seek", "Hide and call the name. A great way to practise coming when called.", "eye-off-outline"), I("Find the treat", "Hide treats around the room and let the nose do the work.", "magnify"), I("Tug with rules", "Start and stop on cue, and ask for 'Drop it' before play resumes.", "rope"), I("Mini obstacle course", "Walk over cushions, through hoops or under a chair.", "run"), I("Trick time", "Teach spin, paw and roll over. Short tricks are great for confidence.", "star-outline")],
      cat: [I("Wand toy hunt", "Move the toy like prey, then let the cat catch it.", "tennis-ball"), I("Treat trail", "Hide treats around the room for a hunt.", "magnify"), I("Box fort", "Cardboard boxes make a great hideout and pounce zone.", "package-variant"), I("Paper ball chase", "Scrunched paper is a cheap, safe toy.", "tennis-ball"), I("Clicker tricks", "Teach a high-five or a touch with tiny treats.", "star-outline")],
      rabbit: [I("Tunnel run", "Cardboard or fabric tunnels encourage zooming.", "package-variant"), I("Treasure box", "Hide hay and greens in a box of paper.", "magnify"), I("Toss toys", "Light toys to flick, throw and chase.", "tennis-ball"), I("Obstacle course", "Low jumps and platforms.", "stairs-up"), I("Nose-touch tricks", "Teach a nose touch with tiny treats.", "star-outline")],
    }[sp];
    const safety = {
      dog: [I("Non-slip floors", "Slippery surfaces are hard on growing and ageing joints.", WARN), I("No high jumps for young dogs", "Wait until the growth plates close.", WARN), I("Watch for tiredness", "Stop if panting heavily, limping or losing interest.", WARN), I("Supervise toys", "Remove pieces that come loose so they cannot be swallowed.", WARN)],
      cat: [I("No string unsupervised", "Cats can swallow string, ribbon or elastic.", WARN), I("Watch for tiredness", "Stop when the cat loses interest or pants.", WARN), I("Put toys away", "Store wand toys out of reach after play.", WARN), I("Avoid hands as toys", "It teaches that skin is a toy.", WARN)],
      rabbit: [I("Non-slip floors", "Rabbits can slip and hurt their legs and back.", WARN), I("Rabbit-proof the area", "Cover cables and block gaps.", WARN), I("Never chase", "Rabbits are prey animals. Let them come to you.", WARN), I("Supervise toys", "Remove anything small that could be swallowed.", WARN)],
    }[sp];
    return [
      about("Make it fun!", `Games turn training into play. They build skills, burn energy and strengthen your bond with ${PN}. ${d.games}`, [
        F("Game length", sp === "dog" ? "5 – 15 minutes" : "5 – 10 minutes", "timer-outline"), F("Best time", sp === "dog" ? "Before meals" : "When alert and calm", "clock-outline"), F("Rewards", "Small treats & praise", "cookie-outline"), F("Stop when", "The fun fades", "emoticon-happy-outline"),
      ]),
      list("Games to play", games),
      list("Keep it safe", safety, { tone: "warn" }),
      tip("Did You Know? 💡", sp === "dog" ? "Sniffing games are surprisingly tiring. Ten minutes of nose work can tire a dog as much as a long walk." : sp === "cat" ? "Hunting games work best when the cat gets to catch the toy at the end. A 'win' keeps play fun." : "Rabbits often show joy with a 'binky', a jump with a twist. It means your rabbit feels safe."),
    ];
  },

  house_training(sp, d) {
    if (sp === "dog") {
      return [
        about("Tips for potty training", `House training takes patience and a steady routine. ${d.house}`, [
          F("Bladder limit", "About 1 hour per month of age", "clock-outline"), F("Go out after", "Sleep, meals & play", "walk"), F("Pick one spot", "Same place each time", "map-marker-outline"), F("Reward", "Straight after it goes", "cookie-outline"),
        ]),
        timeline("A daily routine that works", [
          T("Morning", "First thing", `Take ${PN} out as soon as it wakes up.`),
          T("After meals", "5 – 30 minutes later", "Digestion makes a dog need to go soon after eating or drinking."),
          T("After naps & play", "Every time", "Excitement and waking up both trigger the urge."),
          T("Through the day", "Every 1 – 2 hours", "Young puppies need frequent trips. Stretch this gradually as they grow."),
          T("Night", "Last trip before bed", "Keep it calm and boring so it knows it is time to settle."),
        ]),
        list("When accidents happen", [
          I("Don't scold or rub the nose", "A dog will not connect it to the mistake. It only makes it fearful.", "close-circle-outline"),
          I("Clean with an enzymatic cleaner", "It removes the smell that tells a dog to go there again.", "spray-bottle"),
          I("Supervise and limit space", "Use a gate or crate when you cannot watch closely.", "gate"),
          I("Learn the signals", "Sniffing, circling and whining often mean it needs to go.", "magnify"),
        ], { tone: "warn" }),
        tip("Crate training helps 💡", "Dogs avoid soiling where they sleep, so a right-sized crate teaches bladder control. Never use it as punishment, and do not leave puppies in it longer than they can hold it."),
      ];
    }
    if (sp === "cat") {
      return [
        about("Litter box training", `Cats usually take to the litter box naturally. ${d.house}`, [
          F("Number of boxes", "One per cat, plus one", "package-variant"), F("Scooping", "At least once a day", "broom"), F("Full change", "Every 1 – 2 weeks", "calendar-check-outline"), F("Location", "Quiet, easy to reach", "map-marker-outline"),
        ]),
        timeline("Set up for success", [
          T("Step 1", "Choose the box", "Pick a box large enough to turn around in, with low sides for kittens and older cats."),
          T("Step 2", "Pick a quiet spot", "Away from food, water and noisy appliances."),
          T("Step 3", "Place the cat in it", "After meals and naps, gently place the cat in the box. Do not force it."),
          T("Step 4", "Reward", "Quietly praise or give a treat afterwards."),
        ]),
        list("When accidents happen", [
          I("Never scold", "It makes the cat afraid of the box and of you.", "close-circle-outline"),
          I("Clean with an enzymatic cleaner", "Removes the smell that attracts the cat back.", "spray-bottle"),
          I("See the vet", "Peeing outside the box can mean a urinary problem or pain.", WARN),
          I("Check the setup", "Try a cleaner box, different litter or a quieter spot.", "magnify"),
        ], { tone: "warn" }),
        tip("Blood or straining? 🚨", "If the cat strains, cries in the box or passes blood, see a vet quickly. A blocked urinary tract is an emergency."),
      ];
    }
    return [
      about("Litter training", `Rabbits naturally pick one corner as a toilet, which makes training easy. ${d.house}`, [
        F("Tray", "Large, with hay", "package-variant"), F("Placement", "Where the rabbit goes", "map-marker-outline"), F("Cleaning", "Daily", "broom"), F("Neutering", "Helps a lot", "stethoscope"),
      ]),
      timeline("Set up for success", [
        T("Step 1", "Watch the corner", "Notice where the rabbit likes to go and put the tray there."),
        T("Step 2", "Fill with hay", "Rabbits eat while they go. Put hay at one end of the tray."),
        T("Step 3", "Use rabbit-safe litter", "Choose paper or wood-pellet litter. Avoid clumping litter and cedar or pine shavings."),
        T("Step 4", "Reward", "A small leaf or herb when the tray is used."),
      ]),
      list("When accidents happen", [
        I("Never scold", "Rabbits do not understand punishment and will become afraid.", "close-circle-outline"),
        I("Clean with an enzymatic cleaner", "Removes the smell that attracts the rabbit back.", "spray-bottle"),
        I("Add more trays", "Place one in each favourite corner.", "package-variant"),
        I("See the vet", "Sudden toilet changes can mean a urinary or gut problem.", WARN),
      ], { tone: "warn" }),
      tip("Did You Know? 💡", "Neutering or spaying greatly improves litter habits and reduces territory marking, and it protects the health of the rabbit. Ask your vet when it is right."),
    ];
  },

  leash_training(sp, d) {
    const steps = {
      dog: [
        T("01", "Get comfortable", `Let ${PN} sniff the harness and reward calm investigation before putting it on.`),
        T("02", "Practise indoors", "Attach the leash and reward walking beside you without tension."),
        T("03", "Reward attention", `Say ${PN}'s name and reward for checking in with you during the walk.`),
        T("04", "Increase distractions slowly", "Move to quieter outdoor routes first, then gradually practise around more activity."),
      ],
      cat: [
        T("01", "Get comfortable", `Leave the harness near ${PN}'s food or bed for a few days so it smells familiar.`),
        T("02", "Wear it indoors", "Put it on for a few minutes with treats, then take it off. Build up the time."),
        T("03", "Add a light lead", "Let the lead trail behind indoors while you supervise."),
        T("04", "Go outside slowly", "Start in a quiet, enclosed place. Let the cat lead the way and never pull."),
      ],
      rabbit: [
        T("01", "Get comfortable", "Let the rabbit sniff the harness and reward calm investigation before putting it on."),
        T("02", "Wear it briefly", "Fit it gently with a helper, for a minute at a time, with greens as rewards."),
        T("03", "Add a light lead", "Let the lead trail behind indoors while you supervise."),
        T("04", "Go outside slowly", "Start on a quiet, safe lawn. Follow the rabbit, never pull or steer."),
      ],
    }[sp];
    const safer = {
      dog: [I("Use suitable equipment", "Choose a well-fitted harness or collar and a secure leash that suits the dog.", "shield-check-outline"), I("Avoid leash jerks", "Use rewards and direction changes instead of pulling or punishment.", "heart-outline"), I("Watch the environment", "Avoid hot pavement, traffic, unsafe dogs and areas where local rules prohibit pets.", "map-marker-outline")],
      cat: [I("Use an escape-proof harness", "Choose a snug H-style or vest harness made for cats. Collars are not safe for walking.", "shield-check-outline"), I("Never force it", "If the cat freezes or flops, stop and try again another day.", "heart-outline"), I("Choose quiet places", "Avoid dogs, traffic and crowds, and keep vaccines and parasite protection up to date.", "map-marker-outline")],
      rabbit: [I("Use a rabbit harness", "Choose a snug, escape-proof harness made for rabbits. Never use a collar.", "shield-check-outline"), I("Never pull", "A rabbit's spine is delicate. Follow the rabbit instead.", "heart-outline"), I("Choose safe places", "Avoid dogs, traffic, hot sun and lawns treated with chemicals.", "map-marker-outline")],
    }[sp];
    return [
      about(sp === "dog" ? "Make walks calm and safe" : "Harness training", d.leash, [
        F("Session", "5 – 10 minutes", "timer-outline"), F("Equipment", sp === "dog" ? "Harness + leash" : "Snug harness + light lead", "shield-check-outline"), F("Rewards", "Treats & praise", "cookie-outline"), F("Start in", "A quiet place", "home-outline"),
      ]),
      timeline("Build the skill step by step", steps),
      list(sp === "dog" ? "Safer walks" : "Staying safe", safer),
      tip("Keep track of walks", sp === "dog" ? "Add a Walk task in PetCard to keep your routine visible and consistent." : "Add a play or outdoor task in PetCard to keep your routine visible and consistent.", { label: "Open Tasks", route: "/TasksScreen" }),
    ];
  },
});

addTipBeforeLast("nail_care", "Nail tip 💡", "nail");
addTipBeforeLast("toxic_items", "Poison-proofing tip 💡", "toxic");
addTipBeforeLast("home_safety", "Home tip 💡", "home");
addTipBeforeLast("signs_to_watch", "Watch-out tip 💡", "watch");

/* --------------------------------------------------------------- public API */
export function breedKeysFor(species) {
  return (BREEDS[species] || []).map((b) => b.key);
}

export function buildGuide(pageKey, species, breedKey = "") {
  const page = PAGES[pageKey];
  const base = breedKey ? BREED_DATA[species]?.[breedKey] : GENERIC[species];
  const d = base ? { ...base, ...(breedKey ? EXTRA_BREED[species]?.[breedKey] : EXTRA_GENERIC[species]) } : null;
  if (!page || !d) return null;
  return { pageKey, species, breed: breedKey, chip: pageKey === "breed_information" && breedKey ? d.label : (CHIPS[pageKey] ?? GUIDE_TITLES[pageKey]), sections: page(species, d), footer: GUIDE_FOOTER };
}

/** Every document the seed writes: 9 pages x (3 generic + 7 breeds) = 90. */
export function allGuides() {
  const out = [];
  for (const pageKey of GUIDE_PAGE_KEYS) {
    for (const species of PET_TYPES) {
      out.push(buildGuide(pageKey, species, ""));
      for (const key of breedKeysFor(species)) out.push(buildGuide(pageKey, species, key));
    }
  }
  return out.filter(Boolean);
}