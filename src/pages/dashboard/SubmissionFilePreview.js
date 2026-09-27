import { useEffect, useState } from "react";
import { downloadSubmissionFileBlob } from "./shared";

export default function SubmissionFilePreview({ file, fileUrl, transcript = "" }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    setPreview(null);
    setError("");
    if (!file && !fileUrl) return undefined;
    async function load() {
      try {
        const blob = file || await downloadSubmissionFileBlob(fileUrl);
        const name = file?.name || decodeURIComponent(fileUrl.split("?")[0].split("/").pop());
        const extension = name.split(".").pop().toLowerCase();
        const kind = /^(png|jpe?g|webp|bmp|tiff?)$/.test(extension) ? "image"
          : extension === "pdf" ? "pdf" : /^(txt|md|csv|json)$/.test(extension) ? "text" : "document";
        const text = kind === "text" ? await blob.text() : "";
        if (cancelled) return;
        const mime = kind === "pdf" ? "application/pdf" : kind === "text" ? "text/plain" : blob.type;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: mime }));
        setPreview({ name, kind, url: objectUrl, text });
      } catch {
        if (!cancelled) setError("The original file could not be loaded. Refresh to try again.");
      }
    }
    load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, fileUrl]);

  if (!file && !fileUrl) return <p>No original file attached.</p>;
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!preview) return <p role="status">Loading original file…</p>;
  return <section aria-label="Original submission" className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="break-all text-sm font-semibold">{preview.name}</p>
      <a href={preview.url} download={preview.name} className="text-sm font-bold text-emerald-700 underline">Download original</a>
    </div>
    {preview.kind === "image" && <img src={preview.url} alt="Uploaded submission" className="max-h-96 w-full object-contain" />}
    {preview.kind === "pdf" && <iframe title="Uploaded PDF" src={preview.url} className="h-96 w-full rounded border" />}
    {preview.kind === "text" && <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{preview.text}</pre>}
    {preview.kind === "document" && (transcript
      ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm">{transcript}</pre>
      : <p className="text-sm text-gray-600">Download this document to view it. Extracted text will appear when processing finishes.</p>)}
  </section>;
}
