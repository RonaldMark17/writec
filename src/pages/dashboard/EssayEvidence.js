import { useState } from "react";
import { evidenceSegments, validPercentage } from "./similarityEvidence";
import { PeerComparison, SimilarityDialog } from "./PeerSimilarityReview";

export default function EssayEvidence({ text, ranges, submission }) {
  const [selection, setSelection] = useState(null);
  const [inspecting, setInspecting] = useState(null);
  const selected = selection?.text === text && selection?.ranges === ranges ? selection : null;
  return <>
    <div id="review-transcription" className="whitespace-pre-wrap break-words rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm leading-7">
      {evidenceSegments(text, ranges).map((part, index) => {
        if (!part.matches.length) return part.text;
        const online = part.matches.some(m => m.type === "online"), peer = part.matches.some(m => m.type === "peer");
        const label = online && peer ? "Online + Peer Match" : peer ? "Peer Match" : "Online Source Match";
        return <mark key={index} role="button" tabIndex={0} aria-label={`${label}: ${part.text}`} title={label}
          className={`essay-match cursor-pointer ${peer ? "essay-match-peer" : ""}`}
          onClick={() => setSelection({ ...part, text, ranges, passage: part.text })}
          onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setSelection({ ...part, text, ranges, passage: part.text }); } }}>
          {part.text}
        </mark>;
      })}
    </div>
    {ranges.length > 0 && <p className="mt-2 text-xs">Match legend: <span className="essay-match">Online Source Match (solid underline)</span> / <span className="essay-match essay-match-peer">Peer Match (dotted underline)</span>. Select a passage for details.</p>}
    {selected && <aside aria-label="Selected match details" className="mt-3 rounded-lg border border-gray-300 p-3 text-sm">
      <button type="button" className="similarity-chip float-right" onClick={() => setSelection(null)}>Close match details</button>
      {[...new Map(selected.matches.map(m => [`${m.type}:${m.id || m.url || m.label}`, m])).values()].map((match, index) => <div key={index} className="mb-2">
        <p className="font-semibold">{match.type === "peer" ? "Peer Match" : "Online Source Match"}</p>
        {match.title && <p>{match.title}</p>}
        {match.domain && <p>{match.domain}</p>}
        {validPercentage(match.score) && <p>Match: {match.score}%</p>}
        {match.type === "online" && /^https?:\/\//i.test(match.url || "") && <a href={match.url} target="_blank" rel="noopener noreferrer" className="underline">View Source</a>}
        {match.type === "peer" && match.id && <button type="button" className="similarity-chip" onClick={() => setInspecting(match.id)}>Inspect Match</button>}
      </div>)}
    </aside>}
    {inspecting && <SimilarityDialog title="Peer Similarity Review" onClose={() => setInspecting(null)}>
      <PeerComparison submission={submission} matchedSubmissionId={inspecting} />
    </SimilarityDialog>}
  </>;
}
