/*
 * Run once (and again whenever you edit the texts; it upserts, so it is safe):
 *     node scripts/seedKnowMenu.js
 * "{{petName}}" is replaced with the pet's name by the server.
 */
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import KnowMenu from "../src/models/KnowMenu.js";
import { BREEDS } from "../src/config/breeds.js";

const M = (menuKey, petType, [heroTitle, heroSub, chip], heading, sub, [tipTitle, tipText], items) => ({
  menuKey, petType, breedKey: null, heroTitle, heroSub, chip, heading, sub,
  tip: { title: tipTitle, text: tipText },
  items: items.map(([key, title, itemSub]) => ({ key, title, sub: itemSub })),
});

const BASIC_HEAD = "Daily Care Essentials 🐾";
const BASIC_SUB = "Little things every day make {{petName}}'s life amazing!";
const GROOM_HEAD = "Keep {{petName}} looking and feeling great!";
const SAFE_HEAD = "Safety First, Always. 🛡️";
const TRAIN_HEAD = "Train. Bond. Repeat. 🐾";
const HEALTH_HEAD = "{{petName}}'s Health at a Glance";
const FOOD_HEAD = "Recommended Diet";

const BASE = [
  /* ---------------- DOG ---------------- */
  M("basic_care", "dog", ["Care. Love. Every Day.", "Small daily habits keep {{petName}} happy and healthy.", "Basic Care"],
    BASIC_HEAD, BASIC_SUB,
    ["Care Tip 💛", "A steady daily routine for food, water, play and rest keeps {{petName}} calm and happy."],
    [["routine", "Daily Routine", "Create a daily schedule"], ["hydration", "Hydration", "Water intake guide"], ["sleep", "Sleep & Rest", "How much sleep does {{petName}} need?"], ["play", "Playtime", "Importance of play"], ["love", "Love & Attention", "Bonding with {{petName}} ❤️"]]),
  M("health_wellness", "dog", ["Healthy habits, happy {{petName}}", "Regular check-ups, vaccines and daily care keep {{petName}} feeling great.", "Health Care"],
    HEALTH_HEAD, "Keep up with regular care to keep {{petName}} happy & healthy.",
    ["Prevention beats cure 💉", "Keep yearly check-ups, vaccines and deworming on schedule. Add them in Health Records to get reminders."],
    [["issues", "Common Health Issues", "Learn about issues common in dogs"], ["vaccine", "Vaccination Guide", "Stay on top of core vaccines"], ["exercise", "Exercise Needs", "How much exercise does {{petName}} need?"], ["mental", "Mental Wellness", "Keep {{petName}}'s mind happy"], ["signs", "Signs to Watch", "Early signs of illness"], ["vet", "Vet Check-ups", "Regular check-ups save lives"]]),
  M("food_nutrition", "dog", ["Fuel {{petName}} the right way", "Balanced meals, steady portions and fresh water every day.", "Food & Nutrition"],
    FOOD_HEAD, "A balanced diet keeps {{petName}} energetic and strong.",
    ["Nutrition Tip 🥕", "Always provide fresh water, and keep treats under 10% of daily food."],
    [["types", "Best Food Types", "What to feed {{petName}}"], ["schedule", "Feeding Schedule", "How much & how often"], ["human", "Human Foods", "What's safe & what's not"], ["treats", "Treats & Rewards", "Healthy treat ideas"]]),
  M("grooming", "dog", ["Looking good, feeling great", "A little grooming each week keeps {{petName}}'s coat, skin and nails healthy.", "Grooming"],
    GROOM_HEAD, "",
    ["Grooming Tip ✨", "Regular grooming prevents skin issues and helps you spot lumps, ticks or sore spots early."],
    [["brushing", "Brushing", "How often & how to brush"], ["bathing", "Bathing", "Tips for a good bath"], ["nails", "Nail Care", "Keep those nails trimmed"], ["ears", "Ear Cleaning", "Clean ears safely"], ["shedding", "Shedding Care", "Manage loose fur"]]),
  M("safety", "dog", ["Safety first, always", "Keep {{petName}} safe at home, in the car and on every walk.", "Safety"],
    SAFE_HEAD, "Keep {{petName}} safe at home and on every adventure.",
    ["Safety Tip 🚨", "Keep an ID tag and microchip details up to date, and save your vet's emergency number."],
    [["home", "Home Safety", "Pet-proof your home"], ["car", "Car Safety", "Travel safe with {{petName}}"], ["outdoor", "Outdoor Safety", "Walks & outdoor tips"], ["weather", "Weather Safety", "Hot, cold & rainy care"], ["toxic", "Toxic Items", "Things to keep away"]]),
  M("training", "dog", ["Train. Bond. Repeat.", "Short, positive sessions build trust and good manners.", "Training"],
    TRAIN_HEAD, "Positive training builds trust and good behavior.",
    ["Training Tip 🎯", "Keep sessions to 5–10 minutes and always end on a success."],
    [["commands", "Basic Commands", "Sit, stay, come & more"], ["house", "House Training", "Tips for potty training"], ["leash", "Leash Training", "Walk nicely on leash"], ["behavior", "Behavior Tips", "Solve common behaviors"], ["games", "Fun Games", "Make training fun!"]]),

  /* ---------------- CAT ---------------- */
  M("basic_care", "cat", ["Calm routines, happy cat", "Cats love predictability: steady meals, play and rest keep {{petName}} relaxed.", "Basic Care"],
    BASIC_HEAD, BASIC_SUB,
    ["Routine Tip 🐱", "Cats feel safest with regular meal and play times and a clean litter box."],
    [["routine", "Daily Routine", "Meals, play & litter box"], ["hydration", "Hydration", "Help {{petName}} drink more"], ["sleep", "Sleep & Rest", "Cats sleep 12–16 hours"], ["play", "Playtime", "Hunting games for {{petName}}"], ["love", "Love & Attention", "Bonding on a cat's terms"]]),
  M("health_wellness", "cat", ["A healthy cat is a happy cat", "Cats hide illness well, so routine care and observation matter.", "Health Care"],
    HEALTH_HEAD, "Keep up with regular care to keep {{petName}} happy & healthy.",
    ["Watch the litter box 🐱", "Changes in urination or stool are often the first sign something is wrong. Tell your vet early."],
    [["issues", "Common Health Issues", "Learn about issues common in cats"], ["vaccine", "Vaccination Guide", "Core cat vaccines explained"], ["exercise", "Play & Activity", "How much play does {{petName}} need?"], ["mental", "Mental Wellness", "Enrichment keeps {{petName}} calm"], ["signs", "Signs to Watch", "Cats hide pain: know the signs"], ["vet", "Vet Check-ups", "Yearly visits catch problems early"]]),
  M("food_nutrition", "cat", ["Cats are carnivores", "High-protein meals and plenty of water keep {{petName}} healthy.", "Food & Nutrition"],
    FOOD_HEAD, "A meat-based, balanced diet keeps {{petName}} lean and strong.",
    ["Nutrition Tip 💧", "Cats drink little on their own. Wet food and a water fountain help hydration."],
    [["types", "Best Food Types", "Wet, dry & balanced options"], ["schedule", "Feeding Schedule", "Small meals through the day"], ["human", "Human Foods", "What's safe & what's toxic"], ["treats", "Treats & Rewards", "Healthy treat ideas"]]),
  M("grooming", "cat", ["Gentle grooming, happy cat", "Brushing and quick checks keep {{petName}}'s coat and skin in shape.", "Grooming"],
    GROOM_HEAD, "",
    ["Grooming Tip ✨", "Get {{petName}} used to touch on paws and ears early. It makes nail trims and checks easy."],
    [["brushing", "Brushing", "Keep the coat tangle-free"], ["bathing", "Bathing", "Rarely needed: do it safely"], ["nails", "Nail Care", "Trim and scratch safely"], ["ears", "Ear Cleaning", "Check ears gently"], ["shedding", "Shedding & Hairballs", "Manage loose fur"]]),
  M("safety", "cat", ["A safe space for {{petName}}", "Cat-proof your home and make travel and outdoor time less risky.", "Safety"],
    SAFE_HEAD, "Keep {{petName}} safe at home and on every adventure.",
    ["Safety Tip 🌿", "Lilies are highly toxic to cats. Keep them out of the house entirely."],
    [["home", "Home & Window Safety", "Cat-proof your home"], ["car", "Travel Safety", "Carrier and car tips"], ["outdoor", "Outdoor Safety", "Supervised outdoor time"], ["weather", "Weather Safety", "Heat and cold care"], ["toxic", "Toxic Items", "Plants & foods to avoid"]]),
  M("training", "cat", ["Smart cats learn fast", "Treats, clickers and patience work better than punishment.", "Training"],
    TRAIN_HEAD, "Reward-based training builds trust with {{petName}}.",
    ["Training Tip 🎯", "Use tiny treats and 2–3 minute sessions. Cats lose interest fast."],
    [["commands", "Basic Cues", "Name, come & sit"], ["house", "Litter Training", "Keep the litter box habit"], ["leash", "Harness Training", "Walk safely on a harness"], ["behavior", "Behavior Tips", "Scratching, biting & more"], ["games", "Play & Enrichment", "Fun games for {{petName}}"]]),

  /* ---------------- RABBIT ---------------- */
  M("basic_care", "rabbit", ["Gentle days, happy bunny", "Fresh hay, safe space and calm company keep {{petName}} healthy.", "Basic Care"],
    BASIC_HEAD, BASIC_SUB,
    ["Care Tip 🥕", "Fresh hay, clean water and daily free-roam time are the foundation of a happy rabbit."],
    [["routine", "Daily Routine", "Hay, greens & free-roam"], ["hydration", "Hydration", "Water bowls and fresh greens"], ["sleep", "Sleep & Rest", "Short naps and quiet hides"], ["play", "Playtime", "Tunnels, chewing & digging"], ["love", "Love & Attention", "Earning a rabbit's trust"]]),
  M("health_wellness", "rabbit", ["Gentle care for a gentle friend", "Rabbits hide illness, so daily checks on eating and droppings matter.", "Health Care"],
    HEALTH_HEAD, "Keep up with regular care to keep {{petName}} happy & healthy.",
    ["Rabbits must keep eating 🥕", "If {{petName}} stops eating or pooping for 12 hours, call a rabbit-savvy vet right away."],
    [["issues", "Common Health Issues", "Dental, gut & respiratory issues"], ["vaccine", "Vaccination Guide", "Vaccines and parasite care"], ["exercise", "Exercise Space", "How much room does {{petName}} need?"], ["mental", "Mental Wellness", "Bonding and enrichment"], ["signs", "Signs to Watch", "Not eating is an emergency"], ["vet", "Vet Check-ups", "Find a rabbit-savvy vet"]]),
  M("food_nutrition", "rabbit", ["Hay is the heart of the diet", "Unlimited hay, fresh greens and a few pellets keep {{petName}} healthy.", "Food & Nutrition"],
    FOOD_HEAD, "Mostly hay, plus greens and a few pellets.",
    ["Nutrition Tip 🌾", "Hay should be about 80% of the diet and available all day. It keeps teeth and gut healthy."],
    [["types", "Best Food Types", "Hay, pellets & greens"], ["schedule", "Feeding Schedule", "Daily hay, greens & pellets"], ["human", "Human Foods", "Safe veggies & foods to avoid"], ["treats", "Treats & Rewards", "Healthy, sugar-free treats"]]),
  M("grooming", "rabbit", ["Soft fur, happy bunny", "Regular brushing and gentle checks keep {{petName}} comfortable.", "Grooming"],
    GROOM_HEAD, "",
    ["Grooming Tip ✨", "Never bathe a rabbit in water; it can cause shock. Spot-clean with a damp cloth instead."],
    [["brushing", "Brushing", "Brush gently, more in moult"], ["bathing", "Spot Cleaning", "Rabbits should not be bathed"], ["nails", "Nail Care", "Trim safely at home"], ["ears", "Ear & Teeth Checks", "Spot problems early"], ["shedding", "Moulting Care", "Manage shedding season"]]),
  M("safety", "rabbit", ["A safe bunny space", "Rabbit-proof wires and plants, and keep {{petName}} cool and calm.", "Safety"],
    SAFE_HEAD, "Keep {{petName}} safe at home and on every adventure.",
    ["Safety Tip 🌡️", "Rabbits overheat above about 28°C. Keep {{petName}} in a cool, shaded, ventilated spot."],
    [["home", "Rabbit-proof Home", "Cables, plants & chewables"], ["car", "Travel Safety", "Carrier and travel tips"], ["outdoor", "Outdoor Time", "Safe, supervised play"], ["weather", "Weather Safety", "Rabbits overheat easily"], ["toxic", "Toxic Items", "Foods & plants to avoid"]]),
  M("training", "rabbit", ["Bunnies can learn too", "Patience, treats and a calm voice go a long way.", "Training"],
    TRAIN_HEAD, "Gentle, reward-based training builds trust with {{petName}}.",
    ["Training Tip 🎯", "Reward with a small piece of herb or veg the moment {{petName}} does the right thing."],
    [["commands", "Name & Recall", "Teach {{petName}} to come"], ["house", "Litter Training", "Easy with the right setup"], ["leash", "Harness & Handling", "Safe lifting and harness use"], ["behavior", "Behavior Tips", "Chewing, digging & thumping"], ["games", "Fun Games", "Tunnels, puzzles & play"]]),
];

/* Breed pages replace only the chip and the tip. Order: health, food, grooming, safety, training, basic care. */
const MENUS = ["health_wellness", "food_nutrition", "grooming", "safety", "training", "basic_care"];
const BREED_TIPS = {
  "hungarian-vizsla": [
    "Vizslas are prone to hip dysplasia and separation anxiety. Keep weight lean and avoid long hours alone.",
    "Vizslas burn a lot of energy: feed an active-dog diet in 2 meals and avoid hard exercise right after eating.",
    "The short coat needs only a weekly brush, but check the long ears for moisture and wax.",
    "Vizslas feel the cold and love to run. Use a secure fence or long line, and a coat in winter.",
    "Vizslas need a job: mix training with scent games and plenty of daily exercise.",
    "Vizslas bond closely with their person. Plan a steady daily routine with company, exercise and calm rest so they never feel left out.",
  ],
  "border-collie": [
    "Border Collies can develop hip dysplasia and eye problems such as Collie eye anomaly. Schedule regular eye checks.",
    "High-energy herding dogs need quality protein. Measure meals to avoid weight gain on rest days.",
    "The medium coat sheds seasonally: brush 2–3 times a week, and more when shedding.",
    "Noise-sensitive and chase-prone: avoid fireworks, keep off roads and use a secure fence.",
    "Very smart and needs mental work: puzzle toys, new tricks and herding-style games prevent boredom.",
    "Border Collies thrive on routine. Fixed times for exercise, brain games and rest help a busy mind settle.",
  ],
  "japanese-akita": [
    "Akitas are prone to bloat and thyroid problems. Feed smaller meals and avoid exercise around meals.",
    "Choose a large-breed formula in 2 smaller meals, and never exercise hard right after eating (bloat risk).",
    "The heavy double coat blows twice a year: brush several times a week and never shave it.",
    "Akitas overheat easily and can be selective with other dogs. Keep them cool and leashed around unfamiliar dogs.",
    "Strong-willed and reserved with strangers: start socialisation early and keep training calm and consistent.",
    "Akitas are calm but need a cool, quiet resting place and a steady routine. Respect their space and keep exercise to the cool hours.",
  ],
  persian: [
    "Flat faces can cause breathing and eye problems. Ask your vet about screening for polycystic kidney disease.",
    "Flat-faced cats eat more easily from shallow dishes. Keep weight in check since Persians are low-energy.",
    "The long coat needs daily brushing to prevent mats, and tear stains need a daily wipe.",
    "Persians are indoor cats and overheat easily. Keep them cool and away from open windows.",
    "Gentle and calm: short, reward-based sessions with treats and soft praise work best.",
    "Persians love quiet routines. Plan daily combing, face wiping, short play and a cool, calm resting spot.",
  ],
  himalayan: [
    "Like Persians, Himalayans can have breathing, eye and kidney problems. Keep up with yearly check-ups.",
    "Choose easy-to-grab kibble shapes or wet food for flat faces, and watch calories.",
    "Daily brushing prevents mats in the long coat, and the area around the eyes needs a daily clean.",
    "Keep them indoors in a cool space; flat faces make heat and stress risky.",
    "Calm and affectionate: use gentle play and treat rewards in short sessions.",
    "Himalayans love calm, predictable days. Build daily combing, gentle play and quiet cuddle time into the routine.",
  ],
  "holland-lop": [
    "Lops are prone to dental problems and ear infections. Check teeth and ears often.",
    "Unlimited hay keeps teeth worn down. Limit pellets to avoid obesity.",
    "Check the drooping ears weekly for wax and mites, and brush more during moult.",
    "Handle gently and support the whole body; lops are small and fragile.",
    "Friendly and playful: litter training works well with treats and patience.",
    "Holland Lops are playful and social. Plan daily free-roam time, unlimited hay and gentle floor time with you.",
  ],
  "newzealand-bunny": [
    "Large rabbits are prone to sore hocks and obesity. Soft flooring and lots of exercise help.",
    "A large body needs lots of hay: unlimited hay, measured pellets and fresh greens.",
    "Check the feet for sore hocks and brush during moult.",
    "Needs plenty of space: provide a large, non-slippery enclosure and supervised floor time.",
    "Calm and docile: reward with greens and handle gently to build trust.",
    "New Zealand rabbits need space and calm. Plan long free-roam time on soft flooring, plenty of hay and quiet company.",
  ],
};

const breedDocs = Object.entries(BREEDS).flatMap(([petType, list]) =>
  list.flatMap((b) => {
    const tips = BREED_TIPS[b.key];
    if (!tips) return [];
    return MENUS.map((menuKey, i) => ({ menuKey, petType, breedKey: b.key, chip: b.label, tip: { title: `${b.label} tip 💡`, text: tips[i] } }));
  })
);

async function main() {
  await mongoose.connect(config.mongoUri);
  const docs = [...BASE, ...breedDocs];
  const result = await KnowMenu.bulkWrite(
    docs.map((d) => ({
      replaceOne: { filter: { menuKey: d.menuKey, petType: d.petType, breedKey: d.breedKey }, replacement: d, upsert: true },
    }))
  );
  console.log(`Know menu seeded: ${docs.length} documents (${result.upsertedCount} new, ${result.modifiedCount} updated).`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});