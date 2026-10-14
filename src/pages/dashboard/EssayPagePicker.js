import { useEffect, useState } from "react";
import { DEFAULT_UPLOAD_LIMITS, getUploadLimits, IMAGE_ACCEPT, validateEssayPages } from "./essayPages";

export default function EssayPagePicker({ files, onChange, disabled = false, onError }) {
  const [limits, setLimits] = useState(DEFAULT_UPLOAD_LIMITS);
  const [previews, setPreviews] = useState([]);
  useEffect(() => { let live = true; getUploadLimits().then(value => { if (live) setLimits(value); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  function change(next) {
    try { if (next.length) validateEssayPages(next, limits); onError?.(""); onChange(next); }
    catch (error) { onError?.(error.message); }
  }
  function move(index, offset) {
    const next = [...files];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change(next);
  }
  return <section aria-label="Essay pages" className="mt-4 space-y-3 rounded-lg border bg-white p-4">
    <h3 className="font-semibold">Essay pages ({files.length})</h3>
    <p className="text-sm text-gray-600">Arrange pages in reading order before transcribing. Up to {limits.max_image_bytes / 1024 ** 2} MB per image, {limits.max_submission_bytes / 1024 ** 2} MB total, {limits.max_pages} pages.</p>
    <label className="block text-sm font-semibold">Add pages
      <input aria-label="Add essay pages" type="file" accept={IMAGE_ACCEPT} multiple disabled={disabled}
        onChange={event => { change([...files, ...Array.from(event.target.files || [])]); event.target.value = ""; }} />
    </label>
    <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{files.map((file, index) => <li key={`${index}:${file.name}`} className="space-y-2 rounded border p-3">
      <p className="font-semibold">Page {index + 1}</p>
      <img src={previews[index]} alt={`Page ${index + 1} preview`} className="h-40 w-full object-contain" />
      <p className="break-all text-xs">{file.name}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" aria-label={`Move page ${index + 1} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>Move Up</button>
        <button type="button" aria-label={`Move page ${index + 1} down`} disabled={disabled || index === files.length - 1} onClick={() => move(index, 1)}>Move Down</button>
        <button type="button" aria-label={`Remove page ${index + 1}`} disabled={disabled} onClick={() => change(files.filter((_, i) => i !== index))}>Remove</button>
      </div>
      <label className="block text-xs">Replace page {index + 1}
        <input aria-label={`Replace page ${index + 1}`} type="file" accept={IMAGE_ACCEPT} disabled={disabled}
          onChange={event => { const file = event.target.files?.[0]; if (file) change(files.map((old, i) => i === index ? file : old)); event.target.value = ""; }} />
      </label>
    </li>)}</ol>
  </section>;
}
