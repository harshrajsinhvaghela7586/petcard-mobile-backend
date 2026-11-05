/*
 * What happens when a notification is tapped: the app opens `route` with
 * `params` (an achievement opens the achievements page, a reward opens the
 * rewards page ...). Routes are Expo Router paths.
 */
const ROUTES = {
  achievement_unlocked: "/AchievementScreen",
  level_up: "/LevelScreen",
  reward_received: "/RewardScreen",
  referral_reward: "/RewardScreen",
  admin_reward: "/RewardScreen",
  streak_bonus: "/RewardScreen",
  guardian_request: "/GuardianRequestsScreen",
  guardian_approved: "/GuardianScreen",
  guardian_rejected: "/GuardianScreen",
  guardian_removed: "/GuardianScreen",
  guardian_permissions: "/GuardianScreen",
  task_reminder: "/TaskDetailsScreen",
  task_due: "/TasksScreen",
  health_due: "/HealthRecordScreen",
  health_overdue: "/HealthRecordScreen",
  care_score: "/CareScoreScreen",
  contact_reply: "/ContactusScreen",
  memory_added: "/MemoryScreen",
  admin_announcement: null,
};

export const NOTIFICATION_TYPES = Object.freeze(Object.keys(ROUTES));

const plain = (data) => {
  if (!data) return {};
  const entries = data instanceof Map ? [...data.entries()] : Object.entries(data);
  return Object.fromEntries(entries.map(([k, v]) => [k, String(v)]));
};

/** @returns {{ route: string | null, params: Record<string,string> }} */
export function actionFor(type, data) {
  return { route: Object.hasOwn(ROUTES, type) ? ROUTES[type] : null, params: plain(data) };
}

export const serializeNotification = (n) => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body || "",
  data: plain(n.data),
  action: actionFor(n.type, n.data),
  read: Boolean(n.readAt),
  readAt: n.readAt ?? null,
  createdAt: n.createdAt,
});
