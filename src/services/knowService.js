import { breedProfile, ageInfo, stageName } from "../config/breeds.js";
import { computeGoals } from "./careScore.js";

/*
 * "Know" guides, written for THIS pet: species, breed, age stage, size and
 * weight decide the text and the numbers. The shape of every page matches the
 * app's KnowGuide component: sections of type about | list | timeline | tip.
 * General guidance only: every page ends with a "ask your vet" footer.
 */

export const KNOW_GROUPS = Object.freeze([
  { key: "basic_care", title: "Daily Care Essentials" },
  { key: "learn", title: "Learn More" },
]);

export const KNOW_PAGES = Object.freeze([
  { key: "daily_routine", group: "basic_care", title: "Daily Routine", sub: "Create a daily schedule", icon: "timer-outline", color: "#FF7A00", tint: "#FFE9D6" },
  { key: "hydration", group: "basic_care", title: "Hydration", sub: "Water intake guide", icon: "water", color: "#5E9B2D", tint: "#EAF3DC" },
  { key: "sleep_rest", group: "basic_care", title: "Sleep & Rest", sub: "How much sleep is normal", icon: "sleep", color: "#3B6FB6", tint: "#E6F0FA" },
  { key: "playtime", group: "basic_care", title: "Playtime", sub: "Importance of play", icon: "tennis-ball", color: "#7A9BD6", tint: "#E6F0FA" },
  { key: "love_attention", group: "basic_care", title: "Love & Attention", sub: "Bonding together", icon: "heart", color: "#FF4B32", tint: "#FFE5E1" },
  { key: "breed_info", group: "learn", title: "Breed Information", sub: "Traits and common concerns", icon: "paw", color: "#FF7A00", tint: "#FFE9D6" },
  { key: "feeding", group: "learn", title: "Feeding & Nutrition", sub: "What and how much to feed", icon: "food-variant", color: "#C0504D", tint: "#FBE4E3" },
  { key: "grooming", group: "learn", title: "Grooming", sub: "Coat, nails, teeth and ears", icon: "content-cut", color: "#7A5CC4", tint: "#EEE8FA" },
  { key: "health_care", group: "learn", title: "Health & Vaccines", sub: "Check-ups and prevention", icon: "medical-bag", color: "#2E9E8F", tint: "#E0F4F1" },
  { key: "training", group: "learn", title: "Training", sub: "Positive, reward-based basics", icon: "school-outline", color: "#3B8FD6", tint: "#E3F0FB" },
  { key: "safety", group: "learn", title: "Safety & Toxic Foods", sub: "Keep your pet safe at home", icon: "shield-alert-outline", color: "#E08A00", tint: "#FFF0D6" },
  { key: "emergency", group: "learn", title: "When to See a Vet", sub: "Warning signs", icon: "alert-circle-outline", color: "#FF4B32", tint: "#FFE5E1" },
]);

export const KNOW_PAGE_KEYS = KNOW_PAGES.map((p) => p.key);

const SPECIES = {
  dog: { noun: "dog", walk: "walk", home: "home" },
  cat: { noun: "cat", walk: "play session", home: "home" },
  rabbit: { noun: "rabbit", walk: "exercise time", home: "hutch or pen" },
};

/** Everything the page writers need, computed once. */
export function petContext(pet, today) {
  const type = pet.type === "cat" || pet.type === "rabbit" ? pet.type : "dog";
  const profile = breedProfile(type, pet.breed);
  const age = ageInfo(type, pet.birthDate, today, profile.size);
  const goals = computeGoals({ ...pet, type }, today);
  const name = pet.name || "your pet";
  return {
    name, type, profile, age, goals,
    sp: SPECIES[type],
    stage: age.stage,
    stageText: stageName(type, age.stage),
    breedLabel: profile.known ? profile.label : pet.breed?.trim() || SPECIES[type].noun,
    perMeal: Math.max(5, Math.round(goals.foodGrams / goals.mealsPerDay / 5) * 5),
  };
}

const S = {
  about: (heading, body, facts) => ({ type: "about", heading, body, ...(facts ? { facts } : {}) }),
  list: (heading, items, { intro, tone } = {}) => ({ type: "list", heading, items, ...(intro ? { intro } : {}), ...(tone ? { tone } : {}) }),
  timeline: (heading, steps, intro) => ({ type: "timeline", heading, steps, ...(intro ? { intro } : {}) }),
  tip: (title, body, action) => ({ type: "tip", title, body, ...(action ? { action } : {}) }),
};
const F = (label, value, icon) => ({ label, value, icon });
const I = (title, text, icon) => ({ title, text, icon });
const T = (tag, title, text) => ({ tag, title, text });

const has = (c, flag) => c.profile.flags.includes(flag);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ pages */

const PAGES = {
  daily_routine(c) {
    const { name, type, goals, perMeal } = c;
    const sections = [];
    if (type === "dog") {
      sections.push(S.about("Create a daily schedule", `Dogs feel safest when they know what comes next. A steady routine for meals, walks, play and rest reduces anxiety and makes training easier for ${name}.`, [
        F("Meals", `${goals.mealsPerDay} a day, same time`, "food-variant"),
        F("Activity", `about ${goals.activityMin} min a day`, "walk"),
        F("Water", `about ${goals.waterMl} ml a day`, "cup-water"),
        F("Sleep", c.stage === "baby" ? "18 – 20 hours" : "12 – 14 hours", "sleep"),
      ]));
      sections.push(S.timeline("A sample day", [
        T("7:00 AM", "Wake up", "Potty break and fresh water."),
        T("7:30 AM", "Breakfast", `About ${perMeal} g, then a calm rest.`),
        T("8:30 AM", "Morning walk", `Part of ${name}'s ${goals.activityMin} minutes, with sniffing time.`),
        T("12:00 PM", "Potty & play", "A short game or training session."),
        T("3:00 PM", "Rest & brain games", "A chew toy or puzzle feeder."),
        T("5:30 PM", "Evening walk or fetch", "Burn off the day's energy."),
        T("7:00 PM", "Dinner", goals.mealsPerDay > 2 ? "One of the later meals of the day." : "The second meal of the day."),
        T("9:30 PM", "Last potty, then bed", "Wind down with cuddles or brushing."),
      ]));
    } else if (type === "cat") {
      sections.push(S.about("Create a daily schedule", `Cats love predictability. Regular meals, play and a clean litter box keep ${name} calm and confident.`, [
        F("Meals", `${goals.mealsPerDay} a day`, "food-variant"),
        F("Play", `about ${goals.activityMin} min a day`, "tennis-ball"),
        F("Water", `about ${goals.waterMl} ml a day`, "cup-water"),
        F("Sleep", "12 – 16 hours", "sleep"),
      ]));
      sections.push(S.timeline("A sample day", [
        T("7:00 AM", "Breakfast", `About ${perMeal} g and fresh water.`),
        T("7:30 AM", "Litter box", "Scoop at least once a day."),
        T("10:00 AM", "Window time", "A perch with a view is great enrichment."),
        T("1:00 PM", "Short play", "A wand toy: let the cat 'catch' it at the end."),
        T("6:00 PM", "Dinner", `About ${perMeal} g.`),
        T("8:00 PM", "Play & cuddles", "A longer session before the evening rest."),
      ]));
    } else {
      sections.push(S.about("Create a daily schedule", `Rabbits are most active at dawn and dusk. A routine of fresh hay, greens and safe exercise keeps ${name} healthy.`, [
        F("Hay", "Unlimited, always fresh", "grass"),
        F("Pellets", `about ${goals.foodGrams} g a day`, "food-variant"),
        F("Exercise", "3 – 4 hours out of the pen", "run"),
        F("Water", `about ${goals.waterMl} ml a day`, "cup-water"),
      ]));
      sections.push(S.timeline("A sample day", [
        T("7:00 AM", "Fresh hay & water", "Refill the hay rack and clean the water bowl."),
        T("7:30 AM", "Pellets & greens", "A small measured portion plus leafy greens."),
        T("9:00 AM", "Free-roam time", "In a rabbit-proofed area."),
        T("1:00 PM", "Quiet rest", "Rabbits nap in short bursts."),
        T("6:00 PM", "Greens & playtime", "Tunnels, cardboard boxes and chew toys."),
        T("8:00 PM", "Evening roam & check", "Look at eyes, nose, teeth, bottom and droppings."),
      ]));
    }
    sections.push(S.list("Daily care checklist", [
      I("Fresh water", "Clean the bowl and refill daily.", "cup-water"),
      I("Measured meals", `About ${goals.foodGrams} g a day for ${name}, split into ${goals.mealsPerDay} meals.`, "food-variant"),
      I(type === "rabbit" ? "Exercise" : type === "cat" ? "Play" : "Exercise", `About ${goals.activityMin} minutes a day.`, "run"),
      I("Quick body check", "Eyes, ears, paws, skin and appetite.", "magnify"),
      I("Cuddle time", "Undivided attention matters just as much.", "heart-outline"),
    ], { tone: "good" }));
    sections.push(S.tip("Make it a habit 📅", `Add ${name}'s meals, walks and medicines as tasks and let reminders keep the routine going, even on busy days.`, { label: "Create a task", route: "/CreateTaskScreen" }));
    return sections;
  },

  hydration(c) {
    const { name, type, goals } = c;
    const rate = { dog: "about 50 – 60 ml per kg", cat: "about 40 – 60 ml per kg", rabbit: "about 50 – 150 ml per kg" }[type];
    return [
      S.about("Water intake guide", `Water supports digestion, temperature control and kidney health. For a ${goals.basis.weightKg} kg ${c.sp.noun}, a typical need is ${rate} of body weight a day, so about ${goals.waterMl} ml for ${name}.`, [
        F("Daily goal", `${goals.waterMl} ml`, "cup-water"),
        F("Rule of thumb", rate, "scale-bathroom"),
        F("Bowls", type === "cat" ? "Several, away from food" : "At least 1, always full", "bowl-outline"),
        F("Clean", "Wash bowls every day", "water-check"),
      ]),
      S.list("Easy ways to keep drinking", [
        I("Fresh and clean", "Change the water at least once a day.", "cup-water"),
        type === "cat" ? I("Try a fountain", "Many cats prefer moving water. Wet food also adds water.", "waves") : I("Take water along", "Offer water on walks and after play.", "walk"),
        I("Log it", "Use the water tracker to see how close you are to the daily goal.", "clipboard-text-outline"),
        ...(type === "rabbit" ? [I("Bowl over bottle", "Most rabbits drink more from a heavy ceramic bowl.", "bowl-outline")] : []),
      ], { tone: "good" }),
      S.list("Signs of too little water", [
        I("Dry or sticky gums", "Gums should feel wet and slippery.", "alert-outline"),
        I("Low energy", `${name} seems tired or weak.`, "alert-outline"),
        I("Skin stays 'tented'", "Skin pulled up gently is slow to fall back.", "alert-outline"),
        I("Sunken eyes or very dark urine", "Contact your vet the same day.", "alert-circle-outline"),
      ], { tone: "warn" }),
      has(c, "heat_sensitive") ? S.tip("Hot days", `${c.breedLabel} overheats easily. Offer cool water often and avoid exercise in the midday heat.`) : S.tip("Drinking much more than usual?", "A sudden big change in thirst can be a health sign. Mention it to your vet.", { label: "Add a health note", route: "/HealthRecordScreen" }),
    ];
  },

  sleep_rest(c) {
    const { name, type, stage } = c;
    const hours = { dog: stage === "baby" ? "18 – 20 hours" : stage === "senior" ? "14 – 18 hours" : "12 – 14 hours", cat: stage === "baby" ? "up to 20 hours" : "12 – 16 hours", rabbit: "8 – 12 hours, in short naps" }[type];
    return [
      S.about(`How much sleep does ${name} need?`, `A ${c.stageText} ${c.sp.noun} typically sleeps ${hours} a day. Good rest helps growth, learning, mood and the immune system.`, [
        F("Typical sleep", hours, "sleep"),
        F("Life stage", cap(c.stageText), "paw"),
        F("Best spot", "Quiet, draught-free, cosy", "bed-outline"),
        F("Active times", type === "rabbit" ? "Dawn and dusk" : type === "cat" ? "Dusk and night" : "Daytime", "weather-sunset"),
      ]),
      S.list("A good sleep space", [
        I("Away from noise", "Not next to the TV, door or loud appliances.", "volume-off"),
        I(type === "rabbit" ? "Hide box" : "Comfy bed", type === "rabbit" ? "A box to hide in makes rabbits feel safe." : "Washable and the right size for a stretched-out sleep.", "bed-outline"),
        I("Stable temperature", has(c, "cold_sensitive") ? `${c.breedLabel} feels the cold: keep the bed warm.` : "Avoid hot rooms and cold floors.", "thermometer"),
      ], { tone: "good" }),
      S.list("Talk to your vet if", [
        I("Sleeping much more than usual", "Along with low appetite or low energy.", "alert-outline"),
        I("Restless nights", "Panting, pacing or whining while resting.", "alert-outline"),
        I("Heavy or noisy breathing while asleep", has(c, "brachycephalic") ? `Some noise is common in ${c.breedLabel}, but ask your vet about changes.` : "It should be quiet and regular.", "alert-circle-outline"),
      ], { tone: "warn" }),
    ];
  },

  playtime(c) {
    const { name, type, goals } = c;
    const ideas = {
      dog: [I("Fetch and tug", "Short rounds with rules: drop it, then play again.", "tennis-ball"), I("Sniff walks", "Let the nose lead for 10 minutes.", "walk"), I("Puzzle feeders", "Make mealtime a brain game.", "puzzle-outline")],
      cat: [I("Wand toys", "Move it like prey, and let the cat catch it at the end.", "tennis-ball"), I("Climbing", "Cat trees and shelves give safe height.", "stairs-up"), I("Foraging", "Hide treats around the home.", "puzzle-outline")],
      rabbit: [I("Tunnels and boxes", "Cardboard tunnels are perfect for hiding and zooming.", "package-variant"), I("Chew toys", "Willow, apple wood and hay-filled rolls protect teeth.", "tree-outline"), I("Dig box", "A box of shredded paper gives a safe place to dig.", "shovel")],
    }[type];
    return [
      S.about(`Why ${name} needs play`, `Play burns energy, builds trust and prevents boredom behaviours. For ${c.breedLabel} ${name}, a good target is about ${goals.activityMin} minutes of activity a day.`, [
        F("Daily goal", `${goals.activityMin} min`, "run"),
        F("Energy level", c.profile.energy.replace("_", " "), "flash"),
        F("Life stage", cap(c.stageText), "paw"),
        F("Best split", type === "dog" ? "2–3 sessions" : "Several short bursts", "clock-outline"),
      ]),
      S.list("Fun ideas", ideas, { tone: "good" }),
      c.profile.flags.includes("needs_job") ? S.tip("Busy brain needed", `${c.breedLabel}s are clever and active. Training games and puzzles tire the brain as well as the body.`) : S.tip("Log activity", "Add what you did in the activity tracker to see the daily goal fill up.", { label: "Open activity tracker", route: "/ActivityScreen" }),
    ];
  },

  love_attention(c) {
    const { name, type } = c;
    return [
      S.about(`Bonding with ${name} ❤️`, `${name}'s bond with you grows through calm, consistent, positive time together. Small moments every day matter more than one long session.`),
      S.list("Simple ways to bond", [
        I("Learn the body language", type === "cat" ? "Slow blinks are a sign of trust; flattened ears mean stress." : type === "rabbit" ? "A 'binky' jump means joy; thumping means worry." : "A loose wag and soft eyes mean relaxed; tucked tail means worried.", "emoticon-happy-outline"),
        I("Talk and touch gently", "Use a soft voice and pet where your pet enjoys it.", "hand-heart-outline"),
        I("Offer choices", "Let your pet come to you rather than picking them up every time.", "paw"),
        I("Reward calm moments", "A treat or praise when your pet is relaxed teaches that calm is great.", "star-outline"),
      ], { tone: "good" }),
      S.list("Please avoid", [
        I("Punishment", "Shouting or hitting damages trust and causes fear.", "close-circle-outline"),
        I("Forcing contact", "Never force hugs, handling or being held.", "close-circle-outline"),
      ], { tone: "danger" }),
    ];
  },

  breed_info(c) {
    const p = c.profile;
    const sections = [
      S.about(`About ${c.breedLabel}${p.known ? "" : " (general)"}`, p.known ? `${p.label}: ${p.temperament}. ${cap(p.energy.replace("_", " "))} energy, ${p.coat} coat, ${p.shed} shedding.` : `We do not have a specific profile for this breed, so this is general ${c.sp.noun} guidance. Breed, age, weight and health history all matter.`, [
        F("Origin", p.origin, "crown-outline"),
        F("Size", p.size, "paw"),
        F("Lifespan", p.life, "clock-outline"),
        F("Temperament", p.temperament, "emoticon-happy-outline"),
      ]),
      S.list("Common health concerns", p.concerns.map((x) => I(x, undefined, "heart-pulse")), { intro: "Good to know about, not a guarantee. Ask your vet which check-ups suit this breed.", tone: "warn" }),
    ];
    if (p.known && p.kg) sections.push(S.about("Typical adult weight", `${p.kg[0]} – ${p.kg[1]} kg. ${c.name} currently weighs ${c.goals.basis.weightAssumed ? "an unknown amount (add a weight in Health Records)" : `${c.goals.basis.weightKg} kg`}.`));
    return sections;
  },

  feeding(c) {
    const { name, type, goals, perMeal, stage } = c;
    const sections = [];
    if (type === "rabbit") {
      sections.push(S.about("What a rabbit eats", `About 80–90% of ${name}'s diet should be fresh grass hay (timothy, orchard or meadow). Hay keeps teeth worn down and the gut moving.`, [
        F("Hay", "Unlimited", "grass"),
        F("Leafy greens", "About 1 packed cup per kg", "leaf"),
        F("Pellets", `about ${goals.foodGrams} g a day`, "food-variant"),
        F("Treats", "Rarely, small pieces of fruit", "fruit-cherries"),
      ]));
    } else if (type === "cat") {
      sections.push(S.about("What a cat eats", `Cats are obligate carnivores and need meat-based food with enough protein and taurine. Wet food adds useful water.`, [
        F("Daily amount", `about ${goals.foodGrams} g dry food`, "food-variant"),
        F("Meals", `${goals.mealsPerDay} a day, about ${perMeal} g each`, "clock-outline"),
        F("Water", `about ${goals.waterMl} ml`, "cup-water"),
        F("Treats", "No more than 10% of food", "fish"),
      ]));
    } else {
      sections.push(S.about("What a dog eats", `A complete-and-balanced food suited to ${name}'s life stage (${c.stageText}) is the base of a good diet.`, [
        F("Daily amount", `about ${goals.foodGrams} g dry food`, "food-variant"),
        F("Meals", `${goals.mealsPerDay} a day, about ${perMeal} g each`, "clock-outline"),
        F("Water", `about ${goals.waterMl} ml`, "cup-water"),
        F("Treats", "No more than 10% of food", "bone"),
      ]));
    }
    sections.push(S.list("Feeding tips", [
      I("Use the food label", "The numbers here are an estimate. Compare with the pack's feeding guide and adjust to body shape.", "text-box-check-outline"),
      I("Change food slowly", "Mix old and new food over 7–10 days.", "swap-horizontal"),
      ...(has(c, "food_motivated") ? [I("Watch the weight", `${c.breedLabel} is very food-motivated and gains weight easily. Measure portions and keep treats small.`, "scale-bathroom")] : []),
      ...(stage === "baby" ? [I("Growing bodies", `A ${c.stageText} needs more meals a day and food made for growth.`, "baby-face-outline")] : []),
      ...(stage === "senior" ? [I("Senior needs", "Ask your vet whether a senior diet or joint support is right.", "account-heart-outline")] : []),
      ...(has(c, "bloat_risk") || has(c, "sensitive_stomach") ? [I("Gentle on the stomach", "Several smaller meals and calm time after eating lower the risk of stomach trouble.", "stomach")] : []),
    ], { tone: "good" }));
    sections.push(S.tip("Track meals", `Log each meal in the food tracker so you can see how close ${name} is to the ${goals.foodGrams} g goal.`, { label: "Open food tracker", route: "/FoodScreen" }));
    return sections;
  },

  grooming(c) {
    const { name, type, profile } = c;
    const brushing = { short: "Once a week", medium: "2–3 times a week", long: "Daily", double: "2–3 times a week, daily when shedding", curly: "Daily, plus regular clipping", wire: "Weekly, with hand-stripping", hairless: "No brushing, regular skin care", wool: "Daily to prevent wool block" }[profile.coat] ?? "Weekly";
    const bath = type === "dog" ? "Every 4–8 weeks, or when dirty" : type === "cat" ? "Rarely; most cats clean themselves" : "Never a full bath; spot-clean only";
    return [
      S.about(`Grooming ${name}`, `${cap(profile.coat)} coat with ${profile.shed} shedding. Regular grooming also lets you spot lumps, skin problems and parasites early.`, [
        F("Brushing", brushing, "brush"),
        F("Bath", bath, "shower"),
        F("Nails", "Check every 3–4 weeks", "content-cut"),
        F("Ears & eyes", "Look weekly", "ear-hearing"),
      ]),
      S.list("Routine checklist", [
        I("Brush gently", "Start with short, happy sessions and a treat afterwards.", "brush"),
        I("Trim nails", "Cut only the tip; ask a vet or groomer to show you the first time.", "content-cut"),
        ...(type === "rabbit" ? [I("Teeth are self-grinding", "Unlimited hay and chew toys keep teeth healthy. Drooling or dropped food needs a vet.", "tooth-outline")] : [I("Teeth", "Brush with pet toothpaste (never human) a few times a week.", "tooth-outline")]),
        ...(has(c, "long_ears") || has(c, "lop_ears") ? [I("Ear care", "Floppy ears trap moisture. Check for smell, redness or dirt.", "ear-hearing")] : []),
        ...(has(c, "skin_folds") || has(c, "tear_staining") ? [I("Face folds & tear stains", "Wipe gently and dry well to avoid irritation.", "face-woman-outline")] : []),
        ...(has(c, "clip_needed") ? [I("Regular clipping", "This coat keeps growing: plan a trim every 4–8 weeks.", "content-cut")] : []),
        ...(has(c, "sunburn_prone") ? [I("Sun and oils", "Hairless skin burns and gets oily: wipe regularly, keep out of strong sun.", "white-balance-sunny")] : []),
      ], { tone: "good" }),
      S.tip("Add a grooming reminder", `Create a health record for grooming so ${name} never misses a session.`, { label: "Add record", route: "/HealthRecordScreen" }),
    ];
  },

  health_care(c) {
    const { name, type, stage, profile } = c;
    const vaccines = {
      dog: [T("6–8 weeks", "First core vaccine", "Distemper, parvovirus, hepatitis (DHPP)."), T("every 3–4 weeks", "Boosters", "Until about 16 weeks."), T("12+ weeks", "Rabies", "Required by law in many places, including India."), T("Every year", "Yearly check and boosters", "Your vet sets the schedule.")],
      cat: [T("6–8 weeks", "First core vaccine", "FVRCP (cat flu and panleukopenia)."), T("every 3–4 weeks", "Boosters", "Until about 16 weeks."), T("12+ weeks", "Rabies", "Follow local rules."), T("Every year", "Yearly check", "Outdoor cats may also need FeLV.")],
      rabbit: [T("From ~5 weeks", "Myxomatosis & RHDV", "Availability differs by country: ask your vet."), T("Every year", "Booster and health check", "Include teeth, weight and gut health.")],
    }[type];
    return [
      S.about(`Keeping ${name} healthy`, `Prevention is the best medicine. ${stage === "senior" ? `As a senior ${c.sp.noun}, ${name} should see the vet every 6 months.` : "A yearly vet check, vaccines and parasite control cover the basics."}`, [
        F("Vet check", stage === "senior" ? "Every 6 months" : stage === "baby" ? "Every 3–4 weeks to 16 weeks" : "Once a year", "stethoscope"),
        F("Life stage", cap(c.stageText), "paw"),
        F("Weight", c.goals.basis.weightAssumed ? "Not set yet" : `${c.goals.basis.weightKg} kg`, "scale-bathroom"),
        F("Parasites", type === "rabbit" ? "Check fur and ears" : "Fleas, ticks, worms", "bug-outline"),
      ]),
      S.timeline("Typical vaccine plan", vaccines, "A general guide only. Your vet will confirm the right plan for your area."),
      S.list(`Watch for in ${c.breedLabel}`, profile.concerns.map((x) => I(x, undefined, "heart-pulse")), { tone: "warn" }),
      S.tip("Track it in the app", "Add vaccines, deworming and vet visits as health records. The app shows what is due and reminds you.", { label: "Open health records", route: "/HealthRecordScreen" }),
    ];
  },

  training(c) {
    const { name, type } = c;
    const basics = {
      dog: [I("Name & attention", "Say the name, reward eye contact.", "ear-hearing"), I("Sit and down", "Lure with a treat, reward the moment it happens.", "arrow-down"), I("Come when called", "Practise indoors first, always reward generously.", "run-fast"), I("Loose-lead walking", "Stop when the lead is tight, go when it is loose.", "walk")],
      cat: [I("Name & come", "Call the name and reward with a treat.", "ear-hearing"), I("Litter box habits", "Keep it clean and in a quiet place.", "toilet"), I("Scratching post", "Reward scratching on the post, not the sofa.", "paw"), I("Carrier comfort", "Leave it open at home with treats inside.", "bag-suitcase-outline")],
      rabbit: [I("Litter training", "Put hay in the litter tray: rabbits eat and go together.", "toilet"), I("Come to name", "Offer a small treat when called.", "ear-hearing"), I("Gentle handling", "Pet near the forehead and cheeks, keep all four feet supported.", "hand-heart-outline"), I("Target training", "Teach a nose-touch to guide your rabbit.", "gesture-tap")],
    }[type];
    return [
      S.about(`Training ${name}`, `Reward-based training works for every ${c.sp.noun}. Keep sessions short (5–10 minutes), end on a success, and be patient.${c.profile.flags.includes("needs_job") ? ` ${c.breedLabel}s love having a job, so train often.` : ""}`),
      S.list("Start with the basics", basics, { tone: "good" }),
      S.tip("Use the clicker or whistle", "A clicker marks the exact moment of a good choice. The whistle helps with recall.", { label: "Open clicker", route: "/ClickerScreen" }),
    ];
  },

  safety(c) {
    const { name, type } = c;
    const foods = {
      dog: ["Chocolate and cocoa", "Grapes and raisins", "Onions, garlic and chives", "Xylitol (sugar-free gum, some peanut butter)", "Macadamia nuts", "Alcohol and caffeine", "Cooked bones"],
      cat: ["Lilies (all parts, even pollen)", "Onions, garlic and chives", "Chocolate and caffeine", "Grapes and raisins", "Alcohol and raw dough", "Xylitol", "Dog flea products containing permethrin"],
      rabbit: ["Chocolate and sweets", "Onions, garlic and chives", "Avocado", "Bread, cereal, biscuits and sugary treats", "Potato and rhubarb", "Nuts and seeds", "Iceberg lettuce in large amounts"],
    }[type];
    return [
      S.about(`Keeping ${name} safe`, "Many everyday items are dangerous for pets. If you think your pet ate something harmful, call a vet immediately: do not wait for signs to appear."),
      S.list("Never feed", foods.map((x) => I(x, undefined, "close-circle-outline")), { tone: "danger" }),
      S.list("Around the home", [
        I("Hot weather", has(c, "heat_sensitive") ? `${c.breedLabel} overheats quickly: never leave in a parked car, exercise in the cool hours.` : "Never leave a pet in a parked car; provide shade and water.", "weather-sunny-alert"),
        I("Toxic plants", "Check house plants and garden flowers before bringing them home.", "flower-outline"),
        I("Medicines & cleaners", "Keep human medicines and cleaning products locked away.", "lock-outline"),
        I("Escape-proof", "Secure windows, balconies and gates; keep ID and microchip details current.", "gate"),
      ], { tone: "warn" }),
    ];
  },

  emergency(c) {
    const { name, type } = c;
    const common = [
      I("Trouble breathing", "Gasping, blue or pale gums, or breathing with effort.", "alert-circle-outline"),
      I("Collapse or seizure", `${name} cannot stand, or has a seizure lasting more than 2–3 minutes.`, "alert-circle-outline"),
      I("Heavy bleeding or injury", "Bleeding that does not stop after 5 minutes of pressure.", "alert-circle-outline"),
      I("Suspected poisoning", "Chocolate, xylitol, medicines, plants, rat poison: call straight away.", "alert-circle-outline"),
      I("Repeated vomiting or diarrhoea", "Especially with weakness, blood, or in young and old pets.", "alert-circle-outline"),
    ];
    const extra = {
      dog: [I("Swollen, hard belly with retching", "Possible bloat (GDV) is a life-threatening emergency.", "alert-circle-outline")],
      cat: [I("Straining to pee, or no pee", "A blocked urinary tract can be fatal within a day, most often in male cats.", "alert-circle-outline"), I("Not eating for 24 hours", "Cats can develop liver problems quickly.", "alert-circle-outline")],
      rabbit: [I("No food or droppings for 8–12 hours", "Gut stasis is an emergency in rabbits.", "alert-circle-outline"), I("Head tilt, rolling or sudden weakness", "Needs a rabbit-savvy vet quickly.", "alert-circle-outline")],
    }[type];
    return [
      S.about("Go to a vet right away if", `These signs mean ${name} needs urgent care. Save your vet's number in the app so you can call fast.`),
      S.list("Emergency signs", [...common, ...extra], { tone: "danger" }),
      S.tip("Save your vet's details", "Add your vet's name and phone to the pet profile: they also show on the emergency card.", { label: "Open emergency card", route: "/EmergencyCardScreen" }),
    ];
  },
};

const FOOTER = (name) => `General guidance only. Please consult your vet for ${name}'s specific needs.`;

export function buildKnowIndex(pet, today) {
  const c = petContext(pet, today);
  return {
    pet: { id: String(pet._id), name: c.name, type: c.type, breed: c.breedLabel, stage: c.stage },
    groups: KNOW_GROUPS.map((g) => ({
      key: g.key,
      title: g.title,
      sub: `Little things every day make ${c.name}'s life amazing!`,
      items: KNOW_PAGES.filter((p) => p.group === g.key).map(({ key, title, sub, icon, color, tint }) => ({ key, title, sub, icon, color, tint })),
    })),
  };
}

export function buildKnowPage(key, pet, today) {
  if (!Object.hasOwn(PAGES, key)) return null;
  const c = petContext(pet, today);
  const meta = KNOW_PAGES.find((p) => p.key === key);
  return {
    key,
    title: meta.title,
    chip: key === "breed_info" ? c.breedLabel : meta.title,
    pet: { id: String(pet._id), name: c.name, type: c.type, breed: c.breedLabel, stage: c.stage },
    sections: PAGES[key](c),
    footer: FOOTER(c.name),
  };
}
