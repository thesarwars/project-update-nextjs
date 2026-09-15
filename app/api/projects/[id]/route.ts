import type { NextRequest } from "next/server";
import { badRequest, json, notFound, readJsonBody, requireApiAdmin, trimmedString } from "@/lib/api";
import { deleteProject, updateProject, type ProjectPatch } from "@/lib/db";
import { isValidISODate } from "@/lib/date";
import { DEFAULT_LABELS, SECTION_KEYS, type SectionKey } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  name?: unknown;
  titleTemplate?: unknown;
  labels?: unknown;
  people?: unknown;
  hoursPerDay?: unknown;
  workingDays?: unknown;
  scheduleStart?: unknown;
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const auth = await requireApiAdmin(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const body = await readJsonBody<Body>(request);
  if (!body) return badRequest("Expected a JSON body.");

  const patch: ProjectPatch = {};

  if (body.name !== undefined) {
    const name = trimmedString(body.name, 80);
    if (!name) return badRequest("A project name is required.");
    patch.name = name;
  }
  if (typeof body.titleTemplate === "string") patch.titleTemplate = body.titleTemplate.slice(0, 200);

  if (body.labels !== undefined) {
    if (typeof body.labels !== "object" || body.labels === null) {
      return badRequest("labels must be an object.");
    }
    const incoming = body.labels as Record<string, unknown>;
    const labels: Partial<Record<SectionKey, string>> = {};
    for (const key of SECTION_KEYS) {
      if (incoming[key] === undefined) continue;
      labels[key] = trimmedString(incoming[key], 40) ?? DEFAULT_LABELS[key];
    }
    patch.labels = labels;
  }

  // Working time. `updateProject` clamps both of these again — this layer is here to
  // refuse nonsense with a message rather than silently coerce it.
  if (body.hoursPerDay !== undefined) {
    const hours = Number(body.hoursPerDay);
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) {
      return badRequest("Hours per day must be between 0.5 and 24.");
    }
    patch.hoursPerDay = hours;
  }

  if (body.workingDays !== undefined) {
    if (!Array.isArray(body.workingDays)) return badRequest("workingDays must be an array.");
    const days = body.workingDays.map(Number);
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return badRequest("Working days are weekday numbers, 0 (Sunday) to 6.");
    }
    if (!days.length) return badRequest("Pick at least one working day.");
    patch.workingDays = days;
  }

  if (body.scheduleStart !== undefined) {
    if (body.scheduleStart === null || body.scheduleStart === "") {
      patch.scheduleStart = null;
    } else if (isValidISODate(body.scheduleStart)) {
      patch.scheduleStart = body.scheduleStart;
    } else {
      return badRequest("scheduleStart must be a date like 2026-09-15.");
    }
  }

  if (body.people !== undefined) {
    if (!Array.isArray(body.people)) return badRequest("people must be an array.");
    patch.people = body.people
      .map((raw) => {
        const person = raw as { id?: unknown; name?: unknown; active?: unknown };
        const name = trimmedString(person?.name, 80);
        if (!name) return null;
        return {
          id: typeof person.id === "string" && person.id ? person.id : undefined,
          name,
          active: person.active !== false,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }

  const project = updateProject(id, patch);
  if (!project) return notFound("No such project.");
  return json({ project });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const auth = await requireApiAdmin(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  if (!deleteProject(id)) return notFound("No such project.");
  return json({ ok: true });
}
