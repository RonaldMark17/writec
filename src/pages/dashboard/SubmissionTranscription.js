export default function SubmissionTranscription({ transcription, disabled = false }) {
  const { status, progress, text, error, setText, retry, pages, setPageText, start } = transcription;
  return <section aria-label="Submission transcription" className="mt-5 space-y-3 rounded-lg border border-emerald-200 bg-white p-4">
    <h3 className="font-bold text-gray-900">Essay text</h3>
    <p role="status" className="text-sm text-emerald-800">{status === "processing"
      ? progress?.pageCount ? `Page ${progress.pageNumber} of ${progress.pageCount} — ${progress.phase}${progress.detectedLineCount ? ` (${progress.processedLineCount} of ${progress.detectedLineCount} lines)` : ""}`
      : progress?.detectedLineCount ? `Transcribing: ${progress.processedLineCount} of ${progress.detectedLineCount} lines…` : "Reading your file and transcribing handwriting…"
      : status === "ready" ? "Transcription ready. Review and correct the text before submitting."
      : status === "waiting" ? "Confirm the page order, then start transcription."
      : "Transcription could not finish."}</p>
    {status === "waiting" && <button type="button" onClick={start} disabled={disabled} className="rounded bg-emerald-700 px-4 py-2 text-white">Transcribe pages</button>}
    {status === "processing" && <p className="text-sm text-gray-600">Text appears as it is recognized. A handwritten page can take several minutes.</p>}
    {error && <div role="alert" className="text-sm text-red-700">{error}
      <button type="button" onClick={retry} disabled={disabled} className="ml-3 font-bold underline">Retry transcription</button>
    </div>}
    {pages?.length > 0 && <details open><summary>Page transcriptions</summary>{pages.map((page, index) => <label key={page.page_number} className="mt-3 block text-sm">Page {page.page_number}
      <textarea aria-label={`Page ${page.page_number} transcription`} rows={5} value={page.text} disabled={disabled || status !== "ready"}
        onChange={event => setPageText(index, event.target.value)} className="block w-full rounded border p-2" />
    </label>)}</details>}
    <p className="font-semibold">Complete Essay</p>
    <textarea aria-label="Essay transcription" rows={10} value={text} readOnly={Boolean(pages?.length)} onChange={(event) => setText(event.target.value)}
      disabled={disabled || status !== "ready"} className="w-full rounded-lg border p-3 text-sm leading-6 disabled:bg-gray-50"
      placeholder="Your essay text will appear here." />
    <p className="text-sm text-gray-600">Click Submit assignment to save the original file and this text. The plagiarism check starts after saving.</p>
  </section>;
}
