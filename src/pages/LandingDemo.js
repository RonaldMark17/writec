import { useEffect, useRef, useState } from "react";
import { compareDemo, DEMO_KEY, reference, samples } from "./landingSamples";

const modes = [["picture", "Picture"], ["file", "Document"], ["text", "Paste Text"]];
const stages = ["Intake", "Detect", "Transcribe", "Verify"];
function previouslyUsed() {
  try { return localStorage.getItem(DEMO_KEY) === "used"; } catch { return false; }
}

export default function LandingDemo({ onAuth }) {
  const [mode, setMode] = useState("picture");
  const [sample, setSample] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [text, setText] = useState("");
  const [used, setUsed] = useState(previouslyUsed);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState(-1);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const sync = () => setUsed(previouslyUsed());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function resetFeedback() { setError(""); setInfo(""); setResult(null); setStage(-1); }
  function changeMode(next) { setMode(next); resetFeedback(); setFile(null); setSample(null); }
  function chooseFiles(list) {
    if (busy) return;
    resetFeedback();
    const chosen = Array.from(list || []);
    if (chosen.length !== 1) { setError("Choose one essay file at a time."); return; }
    const item = chosen[0];
    const valid = mode === "picture" ? /\.(png|jpe?g|webp)$/i.test(item.name) && /image\/(png|jpeg|webp)/.test(item.type)
      : /\.(pdf|docx|txt|md|csv|json)$/i.test(item.name);
    if (!valid) { setError(mode === "picture" ? "Choose a PNG, JPG, JPEG, or WebP image." : "Choose a PDF, DOCX, or text file."); return; }
    if (!item.size || item.size > 10 * 1024 * 1024) { setError("Choose a non-empty file smaller than 10 MB."); return; }
    setFile(item); setSample(null);
    setInfo("Your file stays in this browser. Sign in to process your own files, or choose an essay sample for the free demonstration.");
  }
  async function run(event) {
    event.preventDefault();
    if (locked.current || used || previouslyUsed()) { setUsed(true); return; }
    setError(""); setInfo("");
    if (mode !== "text" && !sample) {
      if (file) setInfo("Your preview is ready. Choose an essay sample to try the demonstration, or sign in for OCR and document processing.");
      else setError("Choose an essay sample, select a file to preview, or paste your essay text.");
      return;
    }
    const essay = mode === "text" ? text.trim() : sample.text;
    if (!essay) { setError("Paste some essay text before running the demonstration."); return; }
    locked.current = true; setBusy(true); setResult(null);
    // Each frame reflects a local preparation operation, not a simulated backend scan.
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    try {
      setStage(0); await frame();
      if (!mounted.current) return;
      setStage(1); await frame();
      if (!mounted.current) return;
      setStage(2); await frame();
      if (!mounted.current) return;
      setStage(3);
      const report = compareDemo(essay);
      await frame();
      if (!mounted.current) return;
      setResult(report); setStage(4); setUsed(true);
      try { localStorage.setItem(DEMO_KEY, "used"); } catch { /* In-memory limit when storage is unavailable. */ }
    } catch { if (mounted.current) { setError("The demonstration could not finish. Please try again."); setStage(-1); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const image = sample?.image || preview;
  return (
    <form className="landing-demo" onSubmit={run} aria-label="Interactive essay demo" aria-busy={busy}>
      <div className="demo-heading"><div><span className="landing-eyebrow">TRY WRITECHECK</span><h2>From essay to insight</h2></div><span className="demo-badge">Free demo</span></div>
      <div className="demo-body">
        <p className="demo-caption">Explore one browser-only demonstration. No account needed, no uploads sent.</p>
        <fieldset disabled={busy} className="demo-inputs">
          <legend className="sr-only">Demo input</legend>
          <div className="sample-chips" aria-label="Essay samples">{samples.map((item, i) => <button key={item.id} type="button" aria-pressed={sample?.id === item.id} onClick={() => { resetFeedback(); setMode("picture"); setSample(item); setFile(null); }}><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span> {item.label}</button>)}</div>
          <p className="demo-caption sample-note">Illustrative handwriting-style cards with prepared transcripts; not OCR accuracy examples.</p>
          <div className="demo-tabs" role="tablist" aria-label="Essay input type">{modes.map(([id, label], i) => <button key={id} type="button" role="tab" id={`demo-tab-${id}`} aria-selected={mode === id} aria-controls="demo-input-panel" tabIndex={mode === id ? 0 : -1} onClick={() => changeMode(id)} onKeyDown={event => {
            let next;
            if (event.key === "ArrowRight") next = (i + 1) % modes.length;
            if (event.key === "ArrowLeft") next = (i + modes.length - 1) % modes.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = modes.length - 1;
            if (next !== undefined) { event.preventDefault(); changeMode(modes[next][0]); document.getElementById(`demo-tab-${modes[next][0]}`).focus(); }
          }}>{label}</button>)}</div>
          <div id="demo-input-panel" role="tabpanel" aria-labelledby={`demo-tab-${mode}`}>
            {mode === "text" ? <div className="demo-text-input"><label htmlFor="demo-essay">Your essay text</label><textarea id="demo-essay" rows={6} maxLength={12000} value={text} placeholder="Paste your essay text to preview the similarity-checking experience…" onChange={event => { setText(event.target.value); resetFeedback(); }} /><div className="demo-text-footer"><button type="button" onClick={() => { setText(samples[0].text); resetFeedback(); }}>Insert sample essay</button><span>{text.length.toLocaleString()} / 12,000</span></div></div> : <>
              <div className={`demo-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); chooseFiles(event.dataTransfer.files); }}>
                {image ? <img className="demo-essay-image" src={image} alt={sample ? `${sample.label}: illustrative handwritten essay` : "Selected essay preview"} onError={() => { setError("This image could not be displayed. Try another image."); setFile(null); setSample(null); }} /> : <><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></svg><strong>{mode === "picture" ? "Drop your essay photo here" : "Preview an essay document"}</strong><span>or choose a file</span></>}
                <label className="demo-file-label">{image || file ? "Change file" : "Choose file"}<input ref={input} type="file" aria-label={mode === "picture" ? "Choose essay image" : "Choose essay document"} accept={mode === "picture" ? "image/png,image/jpeg,image/webp" : ".pdf,.docx,.txt,.md,.csv,.json"} onChange={event => { chooseFiles(event.target.files); event.target.value = ""; }} /></label>
                <small>{mode === "picture" ? "PNG, JPG, JPEG, WebP" : "PDF, DOCX, text files"} · Up to 10 MB</small>
              </div>
              {(sample || file) && <div className="demo-attachment">{image && <img src={image} alt="" />}<div><strong>{sample ? `${sample.label} · prepared sample` : file.name}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · local preview` : "Prepared transcript included"}</span></div><button type="button" aria-label="Remove selected essay" onClick={() => { setFile(null); setSample(null); resetFeedback(); }}>×</button></div>}
            </>}
          </div>
        </fieldset>
        {error && <p className="demo-notice demo-error" role="alert">{error}</p>}
        {info && <div className="demo-notice" role="status">{info} <button type="button" onClick={() => onAuth("login")}>Sign in</button></div>}
        <button className="demo-run" type="submit" disabled={busy || used}><span aria-hidden="true">⌕</span> {busy ? "Preparing demonstration…" : "Run Originality Check"}</button>
        <div className="demo-pipeline"><div className="demo-caption">{busy ? "Preparing local example…" : stage === 4 ? "Demonstration complete" : "Your review, step by step"}</div><ol aria-label="Demo progress">{stages.map((label, i) => <li key={label} className={stage > i ? "is-complete" : stage === i ? "is-active" : ""} aria-current={stage === i ? "step" : undefined}><span className="pipeline-dot" aria-hidden="true">{stage > i ? "✓" : i + 1}</span><strong>{label}</strong><span className="sr-only">{stage > i ? "Complete" : stage === i ? "In progress" : "Pending"}</span></li>)}</ol><p className="demo-caption">{mode === "text" ? "Pasted text skips image detection and OCR." : "Sample detection and transcription use prepared content."} Verify compares one reference passage locally.</p></div>
        {result && <section className="demo-result" aria-label="Demonstration result" tabIndex={-1}><span className="landing-eyebrow">DEMONSTRATION RESULT</span><h3>{result.index >= 0 ? "One matching passage to review" : "No exact match in this example"}</h3><p className="demo-caption">{result.words} words · Compared with one demo reference only. This is not a web or classroom scan and does not establish plagiarism or originality.</p><h4>{mode === "text" ? "Your text" : "Prepared transcript"}</h4><p className="demo-transcript">{result.index >= 0 ? <>{result.text.slice(0, result.index)}<mark>{result.text.slice(result.index, result.index + reference.length)}</mark>{result.text.slice(result.index + reference.length)}</> : result.text}</p><h4>Demo reference · Community writing exercise</h4><blockquote>{reference}</blockquote></section>}
        {used && <div className="demo-notice demo-complete" role="status"><strong>You've completed the demo.</strong><p>Sign in or create an account to continue using WriteCheck.</p><div><button type="button" className="demo-account" onClick={() => onAuth("register")}>Create account</button><button type="button" onClick={() => onAuth("login")}>Sign in</button></div></div>}
      </div>
    </form>
  );
}
