import { isProjectMember } from "./db";
import type { User } from "./types";

/**
 * Who can see a project.
 *
 * An administrator sees everything; everyone else sees the projects whose roster they
 * are on. Membership is the `people` row that already drives the standup, so joining a
 * project and appearing in its update are the same fact rather than two to keep in step.
 */
export function canAccessProject(user: User, projectId: string): boolean {
  return user.role === "admin" || isProjectMember(user.id, projectId);
}

/**
 * Who can edit an entry.
 *
 * Any member of a project may edit any row in it, deliberately. The standup is often
 * filled in by one person reading out the team's updates, and locking each row to its
 * owner would break that on the first day. `entries.updated_by` records who actually
 * typed, so this can be tightened later without losing the history to do it from.
 */
export function canEditEntries(user: User, projectId: string): boolean {
  return canAccessProject(user, projectId);
}

/** Project settings, the roster, and invitations. */
export function canManageProject(user: User): boolean {
  return user.role === "admin";
}
