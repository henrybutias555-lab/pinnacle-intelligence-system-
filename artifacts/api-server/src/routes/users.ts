import { count, eq } from "drizzle-orm";
import { Router } from "express";
import {
  InviteUserBody,
  InviteUserResponse,
  ListUsersResponse,
  UpdateUserRoleBody,
  UpdateUserRoleParams,
  UpdateUserRoleResponse,
} from "@workspace/api-zod";
import { db, userProfilesTable } from "@workspace/db";
import { logActivity } from "../lib/audit";
import { requireRole, supabaseAdmin, type AppRole } from "./auth";

const router = Router();
const adminOnly = requireRole("Admin");

function toApiProfile(profile: typeof userProfilesTable.$inferSelect) {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role as AppRole,
    createdAt: profile.createdAt.toISOString(),
    lastSignInAt: profile.lastSignInAt?.toISOString() ?? null,
  };
}

router.get("/users", adminOnly, async (_req, res): Promise<void> => {
  const profiles = await db
    .select()
    .from(userProfilesTable)
    .orderBy(userProfilesTable.createdAt);
  res.json(ListUsersResponse.parse(profiles.map(toApiProfile)));
});

router.post("/users", adminOnly, async (req, res): Promise<void> => {
  const parsed = InviteUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and role." });
    return;
  }
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    parsed.data.email,
  );
  if (error || !data.user) {
    req.log.warn({ error: error?.message }, "PIS team invitation failed");
    res.status(400).json({ error: error?.message ?? "Unable to invite user." });
    return;
  }

  const [profile] = await db
    .insert(userProfilesTable)
    .values({
      id: data.user.id,
      email: parsed.data.email,
      fullName:
        typeof data.user.user_metadata?.full_name === "string"
          ? data.user.user_metadata.full_name
          : "",
      role: parsed.data.role,
    })
    .onConflictDoUpdate({
      target: userProfilesTable.id,
      set: { email: parsed.data.email, role: parsed.data.role },
    })
    .returning();
  if (!profile) {
    res.status(500).json({ error: "Invitation was sent, but the profile failed to save." });
    return;
  }
  await logActivity(
    "user_invited",
    "user",
    `Invited ${profile.email} as ${profile.role}.`,
    req.pisUser!.fullName,
  );
  res.status(201).json(InviteUserResponse.parse(toApiProfile(profile)));
});

router.patch(
  "/users/:userId/role",
  adminOnly,
  async (req, res): Promise<void> => {
    const params = UpdateUserRoleParams.safeParse(req.params);
    const parsed = UpdateUserRoleBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid user or role." });
      return;
    }
    if (
      params.data.userId === req.pisUser!.id &&
      parsed.data.role !== "Admin"
    ) {
      res.status(400).json({ error: "You cannot remove your own Admin role." });
      return;
    }

    const [target] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.id, params.data.userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Team member not found." });
      return;
    }
    if (target.role === "Admin" && parsed.data.role !== "Admin") {
      const [admins] = await db
        .select({ count: count() })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.role, "Admin"));
      if (Number(admins?.count ?? 0) <= 1) {
        res.status(400).json({ error: "PIS must keep at least one Admin." });
        return;
      }
    }

    const [updated] = await db
      .update(userProfilesTable)
      .set({ role: parsed.data.role })
      .where(eq(userProfilesTable.id, params.data.userId))
      .returning();
    await logActivity(
      "user_role_changed",
      "user",
      `Changed ${updated.email}'s role to ${updated.role}.`,
      req.pisUser!.fullName,
    );
    res.json(UpdateUserRoleResponse.parse(toApiProfile(updated)));
  },
);

export default router;
