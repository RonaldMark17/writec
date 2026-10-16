import { useEffect, useState } from "react";
import { DownloadIcon, downloadSubmissionFileBlob } from "./shared";
import EssayBundlePreview from "./EssayBundlePreview";
import SubmittedImageGallery from "./SubmittedImageGallery";

export default function SubmissionFilePreview(props) {
  if (props.fileUrl?.split("?")[0].endsWith(".essay.zip")) return <EssayBundlePreview {...props} />;
  return <SingleFilePreview {...props} />;
}

function SingleFilePreview({ file, fileUrl, transcript = "", originalsOnly = false, studentReview = false }) {
  const [attempt, setAttempt] = useState(0);
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
  }, [file, fileUrl, attempt]);

  if (!file && !fileUrl) return <p>{studentReview ? "No submitted files available." : "No original file attached."}</p>;
  if (error) return <div role="alert"><p>We couldn't load your submission.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try Again</button></div>;
  if (!preview) return <p role="status">Loading original file…</p>;
  if (studentReview && preview.kind === "image") return <SubmittedImageGallery pages={[{ ...preview, page_number: 1 }]} />;
  return <section aria-label="Original submission" className={studentReview ? "student-document" : "space-y-3 rounded-lg border border-gray-200 bg-white p-4"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="break-all text-sm font-semibold">{preview.name}</p>
      <a href={preview.url} download={preview.name} className="text-sm font-bold text-emerald-700 underline">{studentReview && <DownloadIcon className="mr-2 h-4 w-4" />}{studentReview ? "Download submission" : "Download original"}</a>
    </div>
    {preview.kind === "image" && <img src={preview.url} alt="Uploaded submission" className="max-h-96 w-full object-contain" />}
    {preview.kind === "pdf" && <iframe tabIndex={0} title="Uploaded PDF" src={preview.url} className="h-96 w-full rounded border" />}
    {preview.kind === "text" && (!originalsOnly || studentReview) && <pre tabIndex={0} aria-label="Submitted document text" className="student-document-text max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{preview.text}</pre>}
    {preview.kind === "document" && (!originalsOnly && transcript
      ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm">{transcript}</pre>
      : <p className="text-sm text-gray-600">{originalsOnly ? "Download this document to view the original." : "Download this document to view it. Extracted text will appear when processing finishes."}</p>)}
  </section>;
}
