import { useState } from "react";
import { evidenceSegments, validPercentage } from "./similarityEvidence";
import { PeerComparison, SimilarityDialog } from "./PeerSimilarityReview";

export default function EssayEvidence({ text, ranges, submission, sources = [], mode = "all", onModeChange }) {
  const [selection, setSelection] = useState(null);
  const [inspecting, setInspecting] = useState(null);
  const selected = selection?.text === text && selection?.ranges === ranges ? selection : null;
  const visibleRanges = mode === "plain" ? [] : ranges.filter(range => mode === "all" || range.type === "online");
  const peerCount = new Set(ranges.filter(r => r.type === "peer").map(r => r.id)).size;
  return <div className="plagiarism-highlights">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-bold tracking-wide"><span className="text-emerald-600" aria-hidden="true">&#9679; </span>PLAGIARISM HIGHLIGHTS</h4>
        <span className="report-source-count">{sources.length} External {sources.length === 1 ? "Source" : "Sources"}</span>
      </div>
      <div className="flex flex-wrap gap-1" aria-label="Transcription display">
        {[["all", `All (${sources.length + peerCount})`], ["sources", `Sources (${sources.length})`], ["plain", "Plain"]].map(([value, label]) =>
          <button key={value} type="button" className="similarity-chip" aria-pressed={mode === value}
            onClick={() => { setSelection(null); onModeChange?.(value); }}>{label}</button>)}
      </div>
    </div>
    {visibleRanges.some(r => r.type === "online") && <p className="report-instruction">Click any highlighted passage in the text below to view its source publication and destination link.</p>}
    <div id="review-transcription" className="report-transcription whitespace-pre-wrap break-words rounded-lg p-4 text-sm leading-7">
      {evidenceSegments(text, visibleRanges).map((part, index) => {
        if (!part.matches.length) return part.text;
        const online = part.matches.some(m => m.type === "online"), peer = part.matches.some(m => m.type === "peer");
        const label = online && peer ? "Online + Peer Match" : peer ? "Peer Match" : "Online Source Match";
        return <mark data-source-ids={[...new Set(part.matches.filter(m => m.type === "online").map(m => m.id).filter(Boolean))].join(" ")}
          data-match-types={[...new Set(part.matches.map(m => m.matchType).filter(Boolean))].join(" ")}
          data-match-sources={part.matches.map(m => sources.indexOf(m.source)).filter(i => i >= 0).join(" ")} key={index} role="button" tabIndex={0} aria-label={`${label}: ${part.text}`} title={label}
          className={`essay-match cursor-pointer ${online && peer ? "essay-match-combined" : peer ? "essay-match-peer" : ""} ${part.matches.some(m => m.keyword) ? "essay-keyword" : ""}`}
          onClick={() => setSelection({ ...part, text, ranges, passage: part.text })}
          onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setSelection({ ...part, text, ranges, passage: part.text }); } }}>
          {part.text}
        </mark>;
      })}
    </div>
    <div className="report-legend">
      <span><i className="report-swatch" /> External Database Source Match</span>
      <span><i className="report-swatch report-swatch-peer" /> Classmate / Peer Copy Match</span>
      <span><u>Underlined</u> Key Overlapping Keywords</span>
    </div>
    {selected && <SimilarityDialog title="Match details" onClose={() => setSelection(null)}><aside aria-label="Selected match details" className="mt-3 rounded-lg border border-gray-300 p-3 text-sm">
      {selected.passage !== text && <blockquote className="mb-3 whitespace-pre-wrap border-l-2 pl-3">{selected.passage}</blockquote>}
      {[...new Map(selected.matches.map(m => [`${m.type}:${m.id || m.url || m.label}`, m])).values()].map((match, index) => <div key={index} className="mb-2">
        <p className="font-semibold">{match.type === "peer" ? "Peer Match" : "Online Source Match"}</p>
        {match.title && <p>{match.title}</p>}
        {match.domain && <p>{match.domain}</p>}
        {validPercentage(match.score) && <p>Match: {match.score}%</p>}
        {match.type === "online" && /^https?:\/\//i.test(match.url || "") && <a href={match.url} target="_blank" rel="noopener noreferrer" className="underline">View Source</a>}
        {match.type === "peer" && match.id && <button type="button" className="similarity-chip" onClick={() => setInspecting(match.id)}>Inspect Match</button>}
      </div>)}
    </aside></SimilarityDialog>}
    {inspecting && <SimilarityDialog title="Peer Similarity Review" onClose={() => setInspecting(null)}>
      <PeerComparison submission={submission} matchedSubmissionId={inspecting} />
    </SimilarityDialog>}
  </div>;
}
