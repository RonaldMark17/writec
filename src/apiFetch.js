import { supabase } from "./supabaseClient";

// Send session credentials only to our backend, never to external file URLs.
export async function apiFetch(input, options = {}) {
  const url = new URL(input, window.location.origin);
  const backend = new URL(process.env.REACT_APP_BACKEND_URL || "http://localhost:8000");
  const ocrOrigin = new URL(process.env.REACT_APP_OCR_ENDPOINT || backend.href).origin;
  if (url.origin !== backend.origin && url.origin !== ocrOrigin) return fetch(input, options);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const headers = new Headers(options.headers);
  if (data?.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...options, headers });
}

export async function adminRequest(path, options = {}) {
  const backend = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
  let response;
  try {
    response = await apiFetch(`${backend}/api/admin/${path}`, options);
  } catch (error) {
    if (error instanceof TypeError) throw new Error(`Cannot reach the backend at ${backend}. Start it with npm run start:backend, then click Refresh.`);
    throw error;
  }
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Unable to complete the request.");
  return body;
}
