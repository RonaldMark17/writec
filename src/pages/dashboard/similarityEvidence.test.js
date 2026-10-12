import { collectEvidence, evidenceRanges, evidenceSegments, onlinePreview, scopedPeerMatches } from "./similarityEvidence";

test.each([[null, "Not checked"], [0, "0%"], [24, "24%"], ["", "Not checked"], [-1, "Not checked"], [101, "Not checked"]])("online score %s", (score, expected) => {
  expect(onlinePreview({ scanResult: { score } })).toBe(expected);
});

test("ranges require same scanned text, clamp bounds and preserve metadata", () => {
  const text = "First paragraph.\n\nSecond paragraph.";
  const report = { transcribedText: text, matchedSources: [{ id: "source", title: "Actual title", url: "https://example.com",
    matching_fragments: [{ start: -4, end: 5 }, { start: 18, end: 500 }, { start: 8, end: 3 }, { start: NaN, end: 9 }] }] };
  const ranges = evidenceRanges(text, report);
  expect(ranges.map(r => [r.start, r.end])).toEqual([[0, 5], [18, text.length]]);
  expect(ranges[0]).toMatchObject({ id: "source", title: "Actual title" });
  expect(evidenceRanges("Changed " + text, report)).toEqual([]);
  expect(evidenceRanges(text, { matchedSources: report.matchedSources })).toEqual([]);
});

test("exact matching rejects partial words and ambiguous repeats, while explicit occurrences work", () => {
  const text = "education educational education";
  expect(collectEvidence(text, { matchedSources: [{ matched_text: "education" }] }).unresolved).toHaveLength(1);
  expect(evidenceRanges(text, { matchedSources: [{ matched_text: "education", all_occurrences: true }] }).map(r => [r.start, r.end])).toEqual([[0, 9], [22, 31]]);
  expect(evidenceRanges("educational", { matchedSources: [{ matched_text: "education" }] })).toEqual([]);
});

test("legacy passage shapes and new exact ranges survive without paragraph normalization", () => {
  const text = "First paragraph.\n\nExact passage.";
  const report = { transcribedText: text, result_data: { highlighted_sentences: [{ sentence: "First paragraph.", source_title: "Source A" }],
    matched_sources: [{ title: "Source B", highlight_ranges: [{ start_index: 18, end_index: 31 }] }] } };
  const parts = evidenceSegments(text, evidenceRanges(text, report));
  expect(parts.map(p => p.text).join("")).toBe(text);
  expect(parts.filter(p => p.matches.length)).toHaveLength(2);
});
test("processing, failure, local-only and stale scores are not online zeroes", () => {
  expect(onlinePreview({ processingState: "processing" })).toBe("Checking...");
  expect(onlinePreview({ processingState: "failed" })).toBe("Failed");
  expect(onlinePreview({ scanResult: { mode: "classroom", score: 41 } })).toBe("Not checked");
  expect(onlinePreview({ scanResult: { stale: true, score: 24 } })).toBe("Previous transcription");
});
test("peer evidence excludes foreign classes, assignments, self and invalid scores", () => {
  const base = { id: "a", studentId: "s", classroomId: "c", assignmentId: "task" };
  const peers = [
    { ...base, id: "b", studentId: "t" },
    { ...base, id: "c", studentId: "u", classroomId: "other" },
    { ...base, id: "d", studentId: "v", assignmentId: "other" },
    { ...base, id: "e" },
    { ...base, id: "f", studentId: "w" },
  ];
  const all_matches = peers.map(p => ({ submission_id: p.id, score_percent: p.id === "f" ? null : 41 }));
  const result = scopedPeerMatches({ ...base, scanResult: { peerSimilarity: { all_matches } } }, peers);
  expect(result.map(r => r.submission_id)).toEqual(["b"]);
});
test("exact evidence preserves whitespace and splits overlaps without nesting or guesses", () => {
  const text = "One two three four five.\n\nConclusion.";
  const report = { highlighted_sentences: [{ sentence: "two three four five" }], matchedSources: [{ title: "Conclusion", snippet: "Conclusion." }] };
  const ranges = evidenceRanges(text, report, [{ student_name: "Peer", matching_snippets: ["one two three four"] }]);
  const parts = evidenceSegments(text, ranges);
  expect(parts.map(p => p.text).join("")).toBe(text);
  expect(parts.some(p => p.matches.length === 2)).toBe(true);
  expect(parts.find(p => p.text.includes("Conclusion")).matches).toEqual([]);
  expect(evidenceRanges(text, { score: 24, matchedSources: [{ title: text }] })).toEqual([]);
});
