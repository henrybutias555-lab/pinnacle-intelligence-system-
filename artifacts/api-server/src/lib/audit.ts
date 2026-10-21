import { db, activityLogsTable } from "@workspace/db";

export async function logActivity(
  action: string,
  entityType: string,
  description: string,
  actor: string,
): Promise<void> {
  await db.insert(activityLogsTable).values({
    action,
    entityType,
    description,
    actor,
  });
}

export function toActivityEntry(entry: {
  id: number;
  action: string;
  entityType: string | null;
  description: string;
  actor: string | null;
  createdAt: Date;
}) {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    description: entry.description,
    actor: entry.actor,
    createdAt: entry.createdAt.toISOString(),
  };
}
