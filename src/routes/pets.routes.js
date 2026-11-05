import { Router } from "express";

import * as pets from "../controller/petController.js";
import * as tasks from "../controller/taskController.js";
import * as health from "../controller/healthController.js";
import * as memories from "../controller/memoryController.js";
import * as achievements from "../controller/achievementController.js";
import * as guardians from "../controller/guardianController.js";
import * as stickers from "../controller/stickerController.js";
import * as tracker from "../controller/trackerController.js";
import * as home from "../controller/homeController.js";
import * as know from "../controller/knowController.js";
import * as assistant from "../controller/assistantController.js";
import * as cards from "../controller/cardController.js";
import { petAccess, requireOwner, requirePetPermission } from "../middleware/petAccess.js";
import { inviteCreateLimiter, assistantLimiter } from "../middleware/userLimiters.js";
import * as knowMenu from "../controller/knowMenuController.js";
import * as knowGuide from "../controller/KnowGuideController.js";

export const petsRouter = Router();

/* /api/pets */
petsRouter.get("/", pets.listPets);
petsRouter.post("/", pets.createPetHandler);

/* /api/pets/:petId  (every route below is membership-checked by petAccess) */
petsRouter.get("/:petId", petAccess(), requirePetPermission("view_pet"), pets.getPet);
petsRouter.patch("/:petId", petAccess(), requireOwner, pets.updatePet);
petsRouter.delete("/:petId", petAccess(), requireOwner, pets.deletePet);

petsRouter.get("/:petId/progress", petAccess(), requirePetPermission("view_pet"), pets.getProgress);
petsRouter.get("/:petId/achievements", petAccess(), requirePetPermission("view_pet"), achievements.list);
petsRouter.post("/:petId/stickers", petAccess(), requireOwner, pets.addSticker);
petsRouter.post("/:petId/stickers/:key/select", petAccess(), requireOwner, stickers.selectStickerForPet);
petsRouter.delete("/:petId/stickers/:key", petAccess(), requireOwner, pets.removeSticker);

/* Home, pet card, guides, assistant */
petsRouter.get("/:petId/home", petAccess(), requirePetPermission("view_pet"), home.home);
petsRouter.get("/:petId/card", petAccess(), requirePetPermission("view_pet"), cards.getCard);
petsRouter.post("/:petId/card/regenerate-qr", petAccess(), requireOwner, cards.regenerateQr);
petsRouter.get("/:petId/know", petAccess(), requirePetPermission("view_pet"), know.index);
petsRouter.get("/:petId/know/:pageKey", petAccess(), requirePetPermission("view_pet"), know.page);
petsRouter.get("/:petId/assistant/suggestions", petAccess(), requirePetPermission("view_pet"), assistant.suggestions);
petsRouter.post("/:petId/assistant/chat", petAccess(), requirePetPermission("view_pet"), assistantLimiter, assistant.chat);

petsRouter.get("/:petId/know-menu/:menuKey", petAccess(), requirePetPermission("view_pet"), knowMenu.menu);
petsRouter.get("/:petId/know-guide/:pageKey", petAccess(), requirePetPermission("view_pet"), knowGuide.guide);

/* Daily trackers: food, water, activity, clicker, whistle, care score */
const trackerRouter = Router();
trackerRouter.get("/summary", requirePetPermission("view_tasks"), tracker.summary);
trackerRouter.get("/care-score", requirePetPermission("view_tasks"), tracker.careScore);
trackerRouter.get("/care-score/history", requirePetPermission("view_tasks"), tracker.careHistory);
trackerRouter.get("/entries", requirePetPermission("view_tasks"), tracker.list);
trackerRouter.post("/entries", requirePetPermission("manage_tasks"), tracker.create);
trackerRouter.patch("/entries/:entryId", requirePetPermission("manage_tasks"), tracker.update);
trackerRouter.delete("/entries/:entryId", requirePetPermission("manage_tasks"), tracker.remove);
trackerRouter.post("/counters/:kind", requirePetPermission("manage_tasks"), tracker.tap);
trackerRouter.delete("/counters/:kind", requirePetPermission("manage_tasks"), tracker.resetCounter);
trackerRouter.get("/goals", requirePetPermission("view_tasks"), tracker.getGoals);
trackerRouter.patch("/goals", requireOwner, tracker.setGoals);
petsRouter.use("/:petId/tracker", petAccess(), trackerRouter);

/* Tasks */
const taskRouter = Router();
taskRouter.get("/", requirePetPermission("view_tasks"), tasks.listTasksForDay);
taskRouter.get("/all", requirePetPermission("view_tasks"), tasks.listAllTasks);
taskRouter.get("/history", requirePetPermission("view_tasks"), tasks.history);
taskRouter.post("/", requirePetPermission("manage_tasks"), tasks.createTask);
taskRouter.patch("/:taskId", requirePetPermission("manage_tasks"), tasks.updateTask);
taskRouter.delete("/:taskId", requirePetPermission("manage_tasks"), tasks.archiveTask);
taskRouter.post("/:taskId/complete", requirePetPermission("manage_tasks"), tasks.complete);
petsRouter.use("/:petId/tasks", petAccess(), taskRouter);

petsRouter.get("/:petId/calendar", petAccess(), requirePetPermission("view_tasks"), tasks.calendar);
petsRouter.get("/:petId/reminders", petAccess(), requirePetPermission("view_tasks"), tasks.reminders);

/* Health records */
const healthRouter = Router();
healthRouter.use((req, _res, next) => requirePetPermission(req.method === "GET" ? "view_health" : "manage_health")(req, _res, next));
healthRouter.get("/", health.list);
healthRouter.get("/upcoming", health.upcoming);
healthRouter.get("/summary", health.summary);
healthRouter.post("/", health.create);
healthRouter.get("/:recordId", health.get);
healthRouter.patch("/:recordId", health.update);
healthRouter.post("/:recordId/complete", health.complete);
healthRouter.delete("/:recordId", health.remove);
petsRouter.use("/:petId/health", petAccess(), healthRouter);

/* Memories */
const memoryRouter = Router();
memoryRouter.use((req, _res, next) => requirePetPermission(req.method === "GET" ? "view_memories" : "manage_memories")(req, _res, next));
memoryRouter.get("/", memories.list);
memoryRouter.post("/", memories.create);
memoryRouter.get("/:memoryId", memories.get);
memoryRouter.patch("/:memoryId", memories.update);
memoryRouter.delete("/:memoryId", memories.remove);
petsRouter.use("/:petId/memories", petAccess(), memoryRouter);

/* Co-guardians */
const guardianRouter = Router();
guardianRouter.get("/", guardians.listGuardians);
guardianRouter.get("/permissions", guardians.permissionOptions);
guardianRouter.post("/leave", guardians.leave);
guardianRouter.post("/invites", requireOwner, inviteCreateLimiter, guardians.createInvite);
guardianRouter.delete("/invites/:inviteId", requireOwner, guardians.revokeInvite);
guardianRouter.post("/requests/:requestId/approve", requireOwner, guardians.approveRequest);
guardianRouter.post("/requests/:requestId/reject", requireOwner, guardians.rejectRequest);
guardianRouter.patch("/:userId", requireOwner, guardians.updateGuardianPermissions);
guardianRouter.delete("/:userId", requireOwner, guardians.removeGuardian);
petsRouter.use("/:petId/guardians", petAccess(), guardianRouter);