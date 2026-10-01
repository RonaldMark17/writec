import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getBackendUrl } from "../apiFetch";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pending = useRef(false);
  async function send(event) {
    event.preventDefault();
    if (pending.current) return;
    setError(""); setSuccess("");
    const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
    if (Object.values(values).some((value) => !value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setError("Enter all required fields and a valid email address."); return;
    }
    pending.current = true; setSending(true);
    try {
      const response = await fetch(`${getBackendUrl()}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Your message could not be sent. Please try again.");
      setSuccess("Your message has been sent successfully.");
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (error) { setError(error.message || "Your message could not be sent. Please try again."); }
    finally { pending.current = false; setSending(false); }
  }
  return <main className="min-h-screen bg-[#f8f9fa] px-4 py-10 text-[#202124]">
    <div className="mx-auto max-w-xl rounded-2xl border border-[#dadce0] bg-white p-6 sm:p-8">
      <Link to="/" className="text-sm font-medium text-[#137333] hover:underline">Back to WriteCheck</Link>
      <h1 className="mt-5 text-2xl font-medium">Contact Us</h1>
      <form onSubmit={send} className="mt-6 space-y-4">
        {[['name', 'Name', 120], ['email', 'Email', 254], ['subject', 'Subject', 200], ['message', 'Message', 10000]].map(([key, label, maxLength]) => <label key={key} className="block text-sm font-medium">
          {label}
          {key === "message" ? <textarea required rows={6} maxLength={maxLength} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-1 block w-full rounded-lg border border-[#dadce0] p-3 focus:border-[#137333]" />
            : <input required type={key === "email" ? "email" : "text"} maxLength={maxLength} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-1 block w-full rounded-lg border border-[#dadce0] p-3 focus:border-[#137333]" />}
        </label>)}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm text-[#137333]">{success}</p>}
        <button disabled={sending} type="submit" className="rounded-full bg-[#137333] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{sending ? "Sending..." : "Send message"}</button>
      </form>
    </div>
  </main>;
}
