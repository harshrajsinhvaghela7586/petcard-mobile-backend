import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import * as dashboard from "../controller/admin/dashboardController.js";
import * as users from "../controller/admin/usersController.js";
import * as pets from "../controller/admin/petsController.js";
import * as tasks from "../controller/admin/tasksController.js";
import * as health from "../controller/admin/healthController.js";
import * as calendar from "../controller/admin/calendarController.js";
import * as notifications from "../controller/admin/notificationsController.js";
import * as contacts from "../controller/admin/contactsController.js";
import * as guardians from "../controller/admin/guardiansController.js";
import * as rewards from "../controller/admin/rewardsController.js";
import * as catalog from "../controller/admin/catalogController.js";
import * as achievements from "../controller/admin/achievementsController.js";
import * as rankings from "../controller/admin/rankingsController.js";

/*
 * /api/admin/*  (cookie session; every route needs an admin).
 * Static paths are declared before "/:id" so "stats", "filters", ... are never read as ids.
 * Every list takes ?page&limit (+ its own filters, documented in docs/API.md).
 */
export const adminManagementRouter = Router();
adminManagementRouter.use(requireAdmin);

/* Dashboard + audit */
adminManagementRouter.get("/overview", dashboard.overview);
adminManagementRouter.get("/audit", dashboard.auditLog);

/* Users */
adminManagementRouter.get("/users", users.list);
adminManagementRouter.get("/users/stats", users.stats);
adminManagementRouter.post("/users", users.create);
adminManagementRouter.get("/users/:id", users.detail);
adminManagementRouter.patch("/users/:id", users.update);
adminManagementRouter.post("/users/:id/revoke-sessions", users.revokeSessions);
adminManagementRouter.delete("/users/:id", users.remove);

/* Pets */
adminManagementRouter.get("/pets", pets.list);
adminManagementRouter.get("/pets/filters", pets.filters);
adminManagementRouter.get("/pets/frames", pets.frameUnlocks);
adminManagementRouter.post("/pets", pets.create);
adminManagementRouter.get("/pets/:id", pets.detail);
adminManagementRouter.patch("/pets/:id", pets.update);
adminManagementRouter.delete("/pets/:id", pets.remove);
adminManagementRouter.post("/pets/:id/regenerate-qr", pets.regenerateQr);
adminManagementRouter.post("/pets/:id/grant-xp", pets.grantXp);

/* Tasks */
adminManagementRouter.get("/tasks", tasks.list);
adminManagementRouter.get("/tasks/stats", tasks.stats);
adminManagementRouter.get("/tasks/completions", tasks.completions);
adminManagementRouter.post("/tasks", tasks.create);
adminManagementRouter.get("/tasks/:id", tasks.detail);
adminManagementRouter.patch("/tasks/:id", tasks.update);
adminManagementRouter.post("/tasks/:id/archive", tasks.archive);
adminManagementRouter.patch("/tasks/:id/archive", tasks.archive); // kept for the existing panel
adminManagementRouter.post("/tasks/:id/unarchive", tasks.unarchive);
adminManagementRouter.delete("/tasks/:id", tasks.remove);

/* Health records + calendar / upcoming */
adminManagementRouter.get("/health", health.list);
adminManagementRouter.get("/health/upcoming", health.upcoming);
adminManagementRouter.get("/health/stats", health.stats);
adminManagementRouter.post("/health", health.create);
adminManagementRouter.get("/health/:id", health.detail);
adminManagementRouter.patch("/health/:id", health.update);
adminManagementRouter.post("/health/:id/complete", health.complete);
adminManagementRouter.delete("/health/:id", health.remove);
adminManagementRouter.get("/calendar", calendar.calendar);

/* Notifications */
adminManagementRouter.get("/notifications", notifications.list);
adminManagementRouter.get("/notifications/stats", notifications.stats);
adminManagementRouter.post("/notifications", notifications.send); // kept for the existing panel
adminManagementRouter.post("/notifications/send", notifications.send);
adminManagementRouter.post("/notifications/delete-many", notifications.removeMany);
adminManagementRouter.delete("/notifications/:id", notifications.remove);

/* Contact messages + replies */
adminManagementRouter.get("/contacts", contacts.list);
adminManagementRouter.get("/contacts/stats", contacts.stats);
adminManagementRouter.get("/contacts/:id", contacts.detail);
adminManagementRouter.patch("/contacts/:id", contacts.update);
adminManagementRouter.post("/contacts/:id/reply", contacts.reply);
adminManagementRouter.delete("/contacts/:id", contacts.remove);

/* Guardians */
adminManagementRouter.get("/guardians", guardians.requests);
adminManagementRouter.get("/guardians/members", guardians.members);
adminManagementRouter.patch("/guardians/members/:memberId", guardians.updateMember);
adminManagementRouter.delete("/guardians/members/:memberId", guardians.removeMember);
adminManagementRouter.get("/guardians/invites", guardians.invites);
adminManagementRouter.delete("/guardians/invites/:inviteId", guardians.revokeInvite);
adminManagementRouter.patch("/guardians/:id/decision", guardians.decide);

/* Rewards, referrals */
adminManagementRouter.get("/rewards", rewards.wallets);
adminManagementRouter.get("/rewards/stats", rewards.stats);
adminManagementRouter.get("/rewards/ledger", rewards.ledger);
adminManagementRouter.post("/rewards/:userId/adjust", rewards.adjust);
adminManagementRouter.get("/referrals", rewards.referrals);
adminManagementRouter.patch("/referrals/:id/skip", rewards.skipReferral);
adminManagementRouter.post("/referrals/:id/reward", rewards.rewardReferral);

/* Catalogue (avatars and stickers) */
adminManagementRouter.get("/catalog/ownership", catalog.ownership);
adminManagementRouter.get("/catalog", catalog.list);
adminManagementRouter.post("/catalog", catalog.create);
adminManagementRouter.get("/catalog/:id", catalog.detail);
adminManagementRouter.patch("/catalog/:id", catalog.update);
adminManagementRouter.delete("/catalog/:id", catalog.remove);

/* Achievements, levels, rankings */
adminManagementRouter.get("/achievements", achievements.list);
adminManagementRouter.get("/achievements/definitions", achievements.definitions);
adminManagementRouter.post("/achievements/grant", achievements.grantOne);
adminManagementRouter.get("/achievements/pet/:petId", achievements.forPet);
adminManagementRouter.get("/achievements/user/:userId", achievements.forUser);
adminManagementRouter.delete("/achievements/:id", achievements.revoke);
adminManagementRouter.get("/levels", achievements.levels);
adminManagementRouter.get("/rankings/options", rankings.options);
adminManagementRouter.get("/rankings/users", rankings.users);
adminManagementRouter.get("/rankings/pets", rankings.pets);
