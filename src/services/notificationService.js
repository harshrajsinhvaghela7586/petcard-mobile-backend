import MobileUser from "../models/MobileUser.js";
import { bumpVersions } from "./syncService.js";
import PetMember from "../models/PetMember.js";
import Notification from "../models/Notification.js";
import { queueMail } from "./mailer.js";
import { sendPush } from "./pushService.js";
import { notificationEmail } from "./emailTemplates.js";
import { log, serializeError } from "../utils/logger.js";

/**
 * Creates the in-app notification, then (best-effort) pushes and emails it
 * according to the user's preferences. Never throws: a failed notification
 * must not fail the action that caused it.
 *
 * @param {string} userId
 * @param {{ type: string, title: string, body?: string, data?: Record<string,string> }} n
 * @param {{ email?: boolean }} [options]
 */
/* Types that are about the person's own membership: they must arrive even when the membership is gone or not yet approved. */
const MEMBERSHIP_TYPES = new Set(["guardian_removed", "guardian_request", "guardian_approved", "guardian_rejected", "guardian_joined", "guardian_permissions"]);
/* Which permission a guardian needs to receive each pet-related type (the owner always receives them). */
const NEEDS = { task_reminder: "view_tasks", task_completed: "view_tasks", health_due: "view_health", health_overdue: "view_health", memory_added: "view_memories", level_up: "view_tasks" };

/** A notification about a pet only goes to people who still guard that pet and may see that part of it. */
async function mayReceive(userId, type, data) {
  if (!data?.petId || MEMBERSHIP_TYPES.has(type)) return true;
  const member = await PetMember.findOne({ pet: data.petId, user: userId }).select("role permissions").lean();
  if (!member) return false;
  if (member.role === "owner") return true;
  const needed = NEEDS[type];
  return !needed || (member.permissions || ["view_pet", "view_tasks"]).includes(needed);
}

export async function notify(userId, { type, title, body = "", data = {} }, { email = false } = {}) {
  try {
    const user = await MobileUser.findById(userId).select("email name notificationPrefs").lean();
    if (!user) return;
    if (!(await mayReceive(userId, type, data))) return;

    await Notification.create({ user: userId, type, title, body, data });
    void bumpVersions([`n:${userId}`]);

    if (user.notificationPrefs?.push !== false) {
      sendPush(userId, { title, body, data: { type, ...data } });
    }
    if (email && user.notificationPrefs?.email !== false) {
      const mail = notificationEmail({ name: user.name, title, body });
      queueMail({ to: user.email, ...mail });
    }
  } catch (error) {
    log.warn("notify.failed", { type, error: serializeError(error) });
  }
}

export const notifyMany = (userIds, payload, options) =>
  Promise.all(userIds.map((id) => notify(id, payload, options)));
