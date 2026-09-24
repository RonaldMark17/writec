import { apiFetch } from "./apiFetch";
import { supabase } from "./supabaseClient";
jest.mock("./supabaseClient", () => ({ supabase: { auth: { getSession: jest.fn() } } }));
beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true }); supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } }); });
test("backend requests carry the logged-in session", async () => {
  await apiFetch("http://localhost:8000/api/admin/dashboard");
  expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer test-token");
});
test("external downloads never receive a session token", async () => {
  await apiFetch("https://example.com/file.pdf");
  expect(fetch).toHaveBeenCalledWith("https://example.com/file.pdf", {});
});
