import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { extractTextFromImage } from "./dashboard/ocrService";

export default function Transcribe() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function transcribe(event) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const transcription = await extractTextFromImage(file, { onProgress: setResult, local: true });
      setResult(transcription);
      if (!transcription.text.trim()) setError("No handwriting was recognized. Try a clearer, upright photo with the full page visible.");
    } catch (failure) {
      setError(failure.message || "Transcription failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/" className="text-emerald-700 underline">Back to WriteCheck</Link>
      <header><h1 className="text-3xl font-bold">Handwriting transcription</h1>
        <p className="mt-2 text-slate-600">Upload a handwritten page. YOLO detects the lines and TrOCR reads them. Text appears as each batch finishes.</p>
      </header>
      <form onSubmit={transcribe} className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-5">
        <label className="flex flex-col gap-2 font-semibold">Handwritten image
          <input type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff" disabled={busy}
            onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(""); setResult(null); setError(""); }} />
        </label>
        <button disabled={!file || busy} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "Transcribing…" : "Transcribe handwriting"}
        </button>
      </form>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
      <p role="status" aria-live="polite">{busy
        ? result ? `Reading lines: ${result.processedLineCount} of ${result.detectedLineCount}. CPU processing can take several minutes.` : "Detecting handwritten lines…"
        : result && !error ? `Transcription complete: ${result.processedLineCount} lines.` : "Choose an image to begin."}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-5"><h2 className="mb-4 text-lg font-bold">Original page</h2>
          {preview ? <img src={preview} alt="Selected handwritten page" className="max-h-[650px] w-full object-contain" /> : <p>No image selected.</p>}
        </section>
        <section className="rounded-xl border bg-white p-5"><h2 className="mb-4 text-lg font-bold">Transcribed text</h2>
          <textarea aria-label="Transcribed text" readOnly value={result?.text || ""} rows={20} className="w-full rounded-lg border p-3" placeholder="Your transcription will appear here." />
          {!!result?.lines?.length && <details className="mt-4"><summary>Recognized lines ({result.lines.length})</summary>
            <ol className="mt-3 list-inside list-decimal space-y-2">{result.lines.map((line, index) => <li key={index}>{line}</li>)}</ol>
          </details>}
        </section>
      </div>
    </div>
  </main>;
}
