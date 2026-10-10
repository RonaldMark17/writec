import { useEffect, useState } from "react";
import { apiFetch, getBackendUrl } from "../../apiFetch";

export default function EssayBundlePreview({ fileUrl, transcript }) {
  const [state, setState] = useState({ pages: [], text: "", error: "", loading: true });
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const urls = [];
    setState({ pages: [], text: "", error: "", loading: true });
    async function load() {
      try {
        const endpoint = `${getBackendUrl()}/api/submissions/pages?file_url=${encodeURIComponent(fileUrl)}`;
        const response = await apiFetch(endpoint, { signal: controller.signal });
        if (!response.ok) throw new Error("The essay pages could not be loaded.");
        const manifest = await response.json();
        const pages = [];
        for (const page of [...manifest.pages].sort((a, b) => a.page_number - b.page_number)) {
          const response = await apiFetch(`${endpoint}&page_number=${page.page_number}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`Page ${page.page_number} could not be loaded.`);
          const blob = await response.blob();
          if (!live) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          pages.push({ ...page, url });
        }
        if (live) setState({ pages, text: manifest.text, error: "", loading: false });
      } catch (error) { if (live) setState({ pages: [], text: "", error: error.message, loading: false }); }
    }
    load();
    return () => { live = false; controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [fileUrl]);
  if (state.error) return <p role="alert">{state.error}</p>;
  if (state.loading) return <p role="status">Loading essay pages…</p>;
  return <section aria-label="Original essay pages" className="space-y-3 rounded border bg-white p-4">
    <h3 className="font-semibold">Extracted Essay — {state.pages.length} pages</h3>
    {state.pages.map(page => <details key={page.page_number}><summary>Page {page.page_number}: {page.name}</summary>
      <img src={page.url} alt={`Submitted page ${page.page_number}`} className="max-h-96 w-full object-contain" />
      <a href={page.url} download={page.name} className="text-sm underline">Download page {page.page_number}</a>
      <pre className="whitespace-pre-wrap font-sans text-sm">{page.text}</pre>
    </details>)}
    <details><summary>Complete Essay</summary><pre className="whitespace-pre-wrap font-sans text-sm">{transcript || state.text}</pre></details>
  </section>;
}
