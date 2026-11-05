import { config } from "../config/env.js";
import DeviceToken from "../models/DeviceToken.js";
import { log, serializeError } from "../utils/logger.js";

/* Expo push notifications. Delivery is best-effort and never blocks a request. */

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_TOKEN_RE = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,80}\]$/;

export function sendPush(userId, { title, body, data = {} }) {
  if (!config.push.enabled) return;

  (async () => {
    const devices = await DeviceToken.find({ user: userId }).select("token").lean();
    if (!devices.length) return;

    const messages = devices.map((d) => ({
      to: d.token,
      title,
      body,
      data,
      sound: "default",
      priority: "high",
    }));

    const response = await fetch(EXPO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`expo push status ${response.status}`);

    const { data: tickets } = await response.json();
    const dead = [];
    (tickets || []).forEach((ticket, i) => {
      if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
        dead.push(devices[i].token);
      }
    });
    if (dead.length) await DeviceToken.deleteMany({ token: { $in: dead } });
  })().catch((error) => log.warn("push.failed", { error: serializeError(error) }));
}

/**
 * Bulk push (admin announcements): reads the device tokens of many users in one query and
 * sends them to Expo in chunks of 100 (Expo's limit). Best-effort, never throws, never blocks.
 */
export function sendPushToMany(userIds, { title, body, data = {} }) {
  if (!config.push.enabled || !userIds.length) return;

  (async () => {
    const devices = await DeviceToken.find({ user: { $in: userIds } }).select("token").lean();
    const dead = [];
    for (let i = 0; i < devices.length; i += 100) {
      const chunk = devices.slice(i, i + 100);
      const response = await fetch(EXPO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk.map((d) => ({ to: d.token, title, body, data, sound: "default", priority: "high" }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`expo push status ${response.status}`);
      const { data: tickets } = await response.json();
      (tickets || []).forEach((ticket, j) => {
        if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") dead.push(chunk[j].token);
      });
    }
    if (dead.length) await DeviceToken.deleteMany({ token: { $in: dead } });
  })().catch((error) => log.warn("push.bulk_failed", { error: serializeError(error) }));
}
