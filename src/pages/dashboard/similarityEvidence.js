import { phraseRanges } from "./PeerSimilarityReview";

export function validPercentage(value) {
  return value !== null && value !== undefined && typeof value !== "boolean" && String(value).trim() !== ""
    && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}

export function staleReport(submission) {
  const report = submission.scanResult;
  return Boolean(report?.stale || (typeof report?.transcribedText === "string"
    && report.transcribedText !== submission.transcribedText));
}

export function scopedPeerMatches(submission, submissions) {
  if (staleReport(submission)) return [];
  const peers = new Map(submissions.map(row => [String(row.id), row]));
  const seen = new Set();
  return (submission.scanResult?.peerSimilarity?.all_matches || []).filter(match => {
    const peer = peers.get(String(match.submission_id));
    if (!peer || !peer.studentId || !submission.studentId || String(peer.studentId) === String(submission.studentId)
      || String(peer.classroomId) !== String(submission.classroomId)
      || String(peer.assignmentId) !== String(submission.assignmentId)
      || staleReport(peer) || seen.has(String(peer.id)) || !validPercentage(match.score_percent)) return false;
    seen.add(String(peer.id));
    return true;
  });
}

export function onlinePreview(submission) {
  const report = submission.scanResult;
  if (staleReport(submission)) return "Previous transcription";
  if (["submitted", "processing"].includes(submission.processingState)) return "Checking...";
  if (submission.processingState === "failed") return "Failed";
  if (report?.mode === "classroom") return "Not checked";
  const score = report?.score ?? report?.plagiarism_score;
  return validPercentage(score) ? `${Number(score)}%` : "Not checked";
}

const asArray = value => Array.isArray(value) ? value : [];
const wordChar = value => /[\p{L}\p{N}_]/u.test(value || "");

export function exactRanges(text, phrase) {
  if (typeof phrase !== "string" || !phrase.trim()) return [];
  const ranges = [];
  for (let start = text.indexOf(phrase); start !== -1; start = text.indexOf(phrase, start + phrase.length)) {
    const end = start + phrase.length;
    if ((wordChar(phrase[0]) && wordChar(text[start - 1])) || (wordChar(phrase.at(-1)) && wordChar(text[end]))) continue;
    ranges.push([start, end]);
  }
  return ranges;
}

export function normalizeRanges(text, ranges) {
  return asArray(ranges).filter(r => r && Number.isInteger(r.start) && Number.isInteger(r.end)
    && r.start >= 0 && r.end <= text.length && r.end > r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

// Keep evidence and its metadata together; never infer matches from source titles/snippets.
export function collectEvidence(text, report, peers = []) {
  const ranges = [], unresolved = [];
  if (!report || report.stale || (typeof report.transcribedText === "string" && report.transcribedText !== text)) return { ranges, unresolved };
  function record(start, end, passage, metadata) {
    ranges.push({ start, end, ...metadata, matchType: passage.match_kind });
    // Only explicit comparison keywords within a proven passage receive emphasis.
    for (const word of asArray(passage.matched_words || passage.overlapping_keywords)) {
      for (const [offset, finish] of exactRanges(text.slice(start, end), word)) {
        ranges.push({ start: start + offset, end: start + finish, ...metadata, keyword: true });
      }
    }
  }
  function add(passage, metadata) {
    if (!passage) return;
    const phrase = typeof passage === "string" ? passage : passage.matched_text || passage.matchedText || passage.matching_text || passage.text || passage.sentence;
    const start = passage.start ?? passage.start_index;
    const end = passage.end ?? passage.end_index;
    // Offsets have priority only for the exact scan input; evidenceText is checked by the backend.
    const bound = report.transcribedText === text || report.evidenceText === text;
    if (bound && Number.isInteger(start) && Number.isInteger(end)) {
      const valid = normalizeRanges(text, [{ start, end }]);
      if (valid.length && (!phrase || text.slice(valid[0].start, valid[0].end) === phrase)) {
        record(valid[0].start, valid[0].end, passage, metadata); return;
      }
    }
    if (typeof phrase !== "string" || !phrase.trim()) return;
    let found = exactRanges(text, phrase);
    if (!found.length && metadata.type === "peer") found = phraseRanges(text, phrase);
    // A repeated phrase without location/multiplicity is ambiguous; display it in details instead.
    if (metadata.type !== "peer" && found.length > 1 && passage.all_occurrences !== true) found = [];
    if (found.length) found.forEach(([start, end]) => record(start, end, passage, metadata));
    else unresolved.push({ text: phrase, ...metadata });
  }
  const data = report.result_data || {};
  const sources = asArray(report.matchedSources || data.matched_sources);
  for (const passage of asArray(report.highlighted_sentences || data.highlighted_sentences)) {
    if (!passage || passage.type === "peer") continue;
    const source = sources.find(s => (passage.source_id && s.id === passage.source_id) || (passage.source_url && s.url === passage.source_url));
    add(passage, { type: "online", source, id: source?.id, domain: source?.domain, score: source?.score_percent, label: passage.source_title || "Online Source Match", title: passage.source_title || source?.title, url: passage.source_url || source?.url });
  }
  for (const source of asArray(report.matchedSources || data.matched_sources)) {
    const metadata = { type: "online", source, id: source.id, label: source.title || "Online Source Match",
      title: source.title, url: source.url, domain: source.domain, score: source.score_percent };
    const matched = source.matched_text || source.matchedText || source.matching_text;
    if (matched) add({ ...source, text: matched }, metadata);
    for (const field of ["matching_fragments", "matched_passages", "matching_passages", "highlight_ranges", "ranges"]) {
      for (const passage of asArray(source[field])) add(passage, metadata);
    }
  }
  for (const peer of peers) for (const phrase of asArray(peer.matching_snippets)) {
    add(phrase, { type: "peer", id: peer.submission_id, score: peer.score_percent,
      label: `Peer Match: ${peer.student_name || "Classmate"}` });
  }
  return { ranges: normalizeRanges(text, ranges), unresolved };
}

export function evidenceRanges(text, report, peers = []) { return collectEvidence(text, report, peers).ranges; }

export function evidenceSegments(text, input) {
  const ranges = normalizeRanges(text, input);
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap(r => [r.start, r.end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => ({ text: text.slice(start, boundaries[index + 1]),
    matches: ranges.filter(r => r.start <= start && r.end >= boundaries[index + 1]) }));
}
