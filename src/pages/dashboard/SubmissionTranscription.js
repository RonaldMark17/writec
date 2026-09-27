export default function SubmissionTranscription({ transcription, disabled = false }) {
  const { status, progress, text, error, setText, retry } = transcription;
  return <section aria-label="Submission transcription" className="mt-5 space-y-3 rounded-lg border border-emerald-200 bg-white p-4">
    <h3 className="font-bold text-gray-900">Essay text</h3>
    <p role="status" className="text-sm text-emerald-800">{status === "processing"
      ? progress?.detectedLineCount ? `Transcribing: ${progress.processedLineCount} of ${progress.detectedLineCount} lines…` : "Reading your file and transcribing handwriting…"
      : status === "ready" ? "Transcription ready. Review and correct the text before submitting."
      : "Transcription could not finish."}</p>
    {status === "processing" && <p className="text-sm text-gray-600">Text appears as it is recognized. A handwritten page can take several minutes.</p>}
    {error && <div role="alert" className="text-sm text-red-700">{error}
      <button type="button" onClick={retry} disabled={disabled} className="ml-3 font-bold underline">Retry transcription</button>
    </div>}
    <textarea aria-label="Essay transcription" rows={10} value={text} onChange={(event) => setText(event.target.value)}
      disabled={disabled || status !== "ready"} className="w-full rounded-lg border p-3 text-sm leading-6 disabled:bg-gray-50"
      placeholder="Your essay text will appear here." />
    <p className="text-sm text-gray-600">Click Submit assignment to save the original file and this text. The plagiarism check starts after saving.</p>
  </section>;
}
