import { isSessionExpired } from "./supabaseClient";

describe("Token & Session Expiration Utilities", () => {
  test("returns true for null or undefined session", () => {
    expect(isSessionExpired(null)).toBe(true);
    expect(isSessionExpired(undefined)).toBe(true);
  });

  test("returns false when session expires_at is in the future", () => {
    const futureEpochSeconds = Math.floor(Date.now() / 1000) + 3600; // 1 hour ahead
    const activeSession = {
      access_token: "active-token",
      expires_at: futureEpochSeconds,
    };
    expect(isSessionExpired(activeSession)).toBe(false);
  });

  test("returns true when session expires_at is in the past", () => {
    const pastEpochSeconds = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const expiredSession = {
      access_token: "expired-token",
      expires_at: pastEpochSeconds,
    };
    expect(isSessionExpired(expiredSession)).toBe(true);
  });
});
