import { supabase, signOutAndExpireToken } from "./supabaseClient";
jest.mock("@supabase/supabase-js", () => ({createClient: () => ({auth:{signOut:jest.fn()}})}));
beforeEach(() => {jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear();});
test.each(["returned", "thrown"])("manual sign out preserves storage on %s error", async kind => {
 const error = new Error("Network unavailable");
 if (kind === "returned") supabase.auth.signOut.mockResolvedValue({error});
 else supabase.auth.signOut.mockRejectedValue(error);
 localStorage.setItem("sb-test-auth-token","session");
 sessionStorage.setItem("draft","draft");
 await expect(signOutAndExpireToken("/login",{preserveOnFailure:true})).rejects.toThrow("Network unavailable");
 expect(localStorage.getItem("sb-test-auth-token")).toBe("session");
 expect(sessionStorage.getItem("draft")).toBe("draft");
 expect(supabase.auth.signOut).toHaveBeenCalledWith({scope:"global"});
});
