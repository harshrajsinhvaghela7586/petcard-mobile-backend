import AdminAudit from "../models/AdminAudit.js";
import { log, serializeError } from "../utils/logger.js";

/** Records an admin action. Never throws: a failed audit write must not undo or block the action. */
export function audit(req, action, targetType, targetId, summary = "", meta = null) {
  return AdminAudit.create({
    admin: req.admin?._id ?? null,
    adminEmail: req.admin?.email ?? "",
    action,
    targetType,
    targetId: String(targetId ?? ""),
    summary: String(summary).slice(0, 300),
    meta,
  }).catch((error) => log.warn("admin.audit_failed", { action, error: serializeError(error) }));
}
