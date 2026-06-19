import { describe, expect, it } from "bun:test";
import { getChallengeCooldownState } from "../../src/domains/auth/services";

describe("auth challenge cooldown", () => {
  it("allows a first challenge when there is no recent request", () => {
    const result = getChallengeCooldownState(null, Date.now());

    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("blocks rapid repeat requests within the cooldown window", () => {
    const createdAt = new Date("2026-06-19T10:00:00.000Z").toISOString();
    const now = new Date("2026-06-19T10:00:20.000Z").getTime();
    const result = getChallengeCooldownState(createdAt, now);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(40);
  });

  it("allows a new challenge after the cooldown window passes", () => {
    const createdAt = new Date("2026-06-19T10:00:00.000Z").toISOString();
    const now = new Date("2026-06-19T10:01:05.000Z").getTime();
    const result = getChallengeCooldownState(createdAt, now);

    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });
});
