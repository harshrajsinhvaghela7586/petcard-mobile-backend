import { Router } from "express";

import * as me from "../controller/meController.js";
import * as stickers from "../controller/stickerController.js";
import * as translation from "../controller/translateController.js";
import { accountDeleteLimiter, referralLimiter, translateLimiter, knowAdaptLimiter } from "../middleware/userLimiters.js";

export const meRouter = Router();

meRouter.get("/bootstrap", me.bootstrap);
meRouter.post("/translate", translateLimiter, translation.translate);
meRouter.post("/know-adapt", knowAdaptLimiter, translation.knowAdapt);

meRouter.get("/profile", me.getProfile);
meRouter.patch("/profile", me.updateProfile);
meRouter.delete("/", accountDeleteLimiter, me.removeAccount);

meRouter.get("/rewards", me.rewards);
meRouter.get("/stickers", stickers.listOwnedStickers);
meRouter.post("/stickers/:key/purchase", stickers.purchaseSticker);
meRouter.post("/daily-login", me.claimDailyLoginReward);

meRouter.get("/notifications", me.listNotifications);
meRouter.get("/notifications/unread-count", me.unreadCount);
meRouter.post("/notifications/read", me.markRead);
meRouter.delete("/notifications/:id", me.deleteNotification);
meRouter.delete("/notifications", me.clearNotifications);

meRouter.put("/active-pet", me.setActivePet);
meRouter.get("/reminders", me.myReminders);

meRouter.post("/devices", me.registerDevice);
meRouter.post("/devices/unregister", me.unregisterDevice);

meRouter.get("/referral", me.getReferral);
meRouter.post("/referral/apply", referralLimiter, me.applyReferral);
