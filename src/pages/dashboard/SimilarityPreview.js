import { onlinePreview, scopedPeerMatches, staleReport } from "./similarityEvidence";

export default function SimilarityPreview({ submission, submissions, onReview }) {
  const matches = scopedPeerMatches(submission, submissions);
  const peer = staleReport(submission) ? "Previous transcription" : matches.length
    ? `${Math.max(...matches.map(m => Number(m.score_percent)))}% (${matches.length} ${matches.length === 1 ? "match" : "matches"})`
    : submission.scanResult?.peerSimilarity ? "No current matches" : "Not checked";
  return <div className="flex flex-wrap gap-2 py-1 text-xs">
    <button type="button" className="similarity-chip" onClick={() => onReview(submission)}>Online: {onlinePreview(submission)}</button>
    <button type="button" className="similarity-chip" onClick={() => onReview(submission)}>Peer: {peer}</button>
  </div>;
}
