import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * PATCH /api/admin/rewards/tiers/:id
 * Admin: update a reward tier's title, description, icon, points_required, or active flag.
 */
export async function handleAdminUpdateRewardTier(request, env, tierId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(tierId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid tier ID" }, 400);

  let body;
  try { body = await request.json(); }
  catch { return json({ success: false, message: "Invalid JSON body" }, 400); }

  const { title, description, icon, points_required, active } = body;
  const updates = [];
  const values  = [];

  if (title !== undefined)       { updates.push("title = ?");            values.push(String(title).trim()); }
  if (description !== undefined) { updates.push("description = ?");      values.push(String(description).trim()); }
  if (icon !== undefined)        { updates.push("icon = ?");             values.push(String(icon).trim()); }
  if (points_required !== undefined) {
    const pts = parseInt(points_required, 10);
    if (isNaN(pts) || pts < 1) return json({ success: false, message: "points_required must be a positive integer" }, 400);
    updates.push("points_required = ?");
    values.push(pts);
  }
  if (active !== undefined)      { updates.push("active = ?");           values.push(active ? 1 : 0); }

  if (updates.length === 0) return json({ success: false, message: "Nothing to update" }, 400);

  values.push(id);
  await env.DB.prepare(`UPDATE rewards SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values).run();

  const updated = await env.DB.prepare(
    "SELECT id, title, description, icon, points_required, active FROM rewards WHERE id = ?"
  ).bind(id).first();

  if (!updated) return json({ success: false, message: "Tier not found" }, 404);

  return json({ success: true, tier: updated });
}
