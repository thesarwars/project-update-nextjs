import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysLeft, relativeDayLabel } from "../lib/date";

/**
 * These read as trivia, but they pin down the hydration fix: both helpers used to
 * default `today` to the rendering machine's clock, so the server (usually UTC) and the
 * browser (the viewer's zone) produced different text for the same date for several
 * hours a day. The required parameter is the real guard — tsc rejects a call without it —
 * and these assert the behaviour that made the divergence visible.
 */
describe("relativeDayLabel", () => {
  it("names the day relative to the today it is given, not the clock", () => {
    assert.equal(relativeDayLabel("2026-09-09", "2026-09-09"), "Today");
    assert.equal(relativeDayLabel("2026-09-09", "2026-09-08"), "Tomorrow");
    assert.equal(relativeDayLabel("2026-09-09", "2026-09-10"), "Yesterday");
    // The exact pair that used to diverge: a UTC server one day ahead of a US browser.
    assert.notEqual(
      relativeDayLabel("2026-09-09", "2026-09-09"),
      relativeDayLabel("2026-09-09", "2026-09-08"),
    );
  });

  it("falls back to the weekday once it is further away", () => {
    assert.equal(relativeDayLabel("2026-09-09", "2026-09-01"), "Wednesday");
  });
});

describe("daysLeft", () => {
  it("counts from the given day and returns null once the end has passed", () => {
    assert.equal(daysLeft("2026-09-11", "2026-09-09"), 2);
    assert.equal(daysLeft("2026-09-11", "2026-09-08"), 3);
    assert.equal(daysLeft("2026-09-11", "2026-09-11"), 0);
    assert.equal(daysLeft("2026-09-11", "2026-09-12"), null);
  });
});
