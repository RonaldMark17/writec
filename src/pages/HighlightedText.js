import React, { useState, useMemo } from "react";

/**
 * Clean & Modern Plagiarism Highlighting Component
 * Displays student text with natural, elegant highlights (no disruptive inline badges).
 * Provides interactive sentence inspection, real source links, and keyword emphasis.
 */
export default function HighlightedText({ text, scanResult, defaultFilter = "all" }) {
  const [filter, setFilter] = useState(defaultFilter); // 'all', 'source', 'peer', 'none'
  const [selectedHighlight, setSelectedHighlight] = useState(null);

  // 1. Gather precomputed or dynamically generated sentence highlights
  const highlights = useMemo(() => {
    if (!text) return [];

    const precomputed =
      scanResult?.highlighted_sentences ||
      scanResult?.result_data?.highlighted_sentences ||
      [];

    if (precomputed.length > 0) {
      return precomputed;
    }

    // Dynamic client-side fallback if backend highlights aren't present
    const sources = scanResult?.matchedSources || scanResult?.result_data?.matched_sources || [];
    const peerSnippets = scanResult?.peerSimilarity?.matching_snippets || [];
    const commonWords = new Set([
      "about", "after", "all", "also", "and", "any", "are", "because", "been", "before",
      "being", "between", "both", "but", "can", "could", "did", "does", "doing", "down",
      "during", "each", "few", "for", "from", "further", "had", "has", "have", "having",
      "her", "here", "hers", "him", "his", "how", "into", "its", "just", "more", "most",
      "nor", "not", "off", "once", "only", "other", "our", "ours", "out", "over", "own",
      "same", "should", "some", "such", "than", "that", "the", "their", "theirs", "them",
      "then", "there", "these", "they", "this", "those", "through", "too", "under", "until",
      "very", "was", "were", "what", "when", "where", "which", "while", "who", "whom",
      "why", "will", "with", "would", "you", "your", "like", "making", "make", "first"
    ]);

    const cleanLines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const fullText = cleanLines.join(" ");
    const rawSentences = fullText.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.length > 5);

    const generated = [];

    rawSentences.forEach((sentence, sIdx) => {
      // Check peer snippet match
      let isPeer = false;
      for (const ps of peerSnippets) {
        if (ps && ps.length > 8 && (sentence.toLowerCase().includes(ps.toLowerCase()) || ps.toLowerCase().includes(sentence.toLowerCase()))) {
          generated.push({
            index: sIdx,
            sentence,
            type: "peer",
            label: "Classmate Match",
            matched_words: ps.split(/\s+/).filter(w => !commonWords.has(w.toLowerCase())),
            source_title: "Classroom Peer Submission",
            source_url: "",
            source_type: "Classroom Peer Copy",
            severity: "high",
          });
          isPeer = true;
          break;
        }
      }
      if (isPeer) return;

      // Check external sources match
      const sWords = new Set((sentence.toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !commonWords.has(w)));
      let bestSource = null;
      let maxOverlap = 0;
      let matchedTokens = [];

      for (const src of sources) {
        const srcText = `${src.title || ""} ${src.snippet || ""}`.toLowerCase();
        const srcTokens = new Set((srcText.match(/[a-z]{3,}/g) || []).filter(w => !commonWords.has(w)));
        const overlap = [...sWords].filter(w => srcTokens.has(w));
        if (overlap.length > maxOverlap && overlap.length >= 1) {
          maxOverlap = overlap.length;
          bestSource = src;
          matchedTokens = overlap;
        }
      }

      if (bestSource && maxOverlap >= 1) {
        generated.push({
          index: sIdx,
          sentence,
          type: "source",
          label: "Source Match",
          matched_words: matchedTokens,
          source_title: bestSource.title || "Matched Source",
          source_url: bestSource.url || "",
          source_type: bestSource.source_type || "External Academic Index",
          severity: maxOverlap >= 3 ? "high" : "medium",
        });
      }
    });

    return generated;
  }, [text, scanResult]);

  // Count source vs peer highlights
  const sourceCount = highlights.filter(h => h.type === "source").length;
  const peerCount = highlights.filter(h => h.type === "peer").length;

  // 2. Parse sentences into highlighted elements with clean inline text
  const renderedContent = useMemo(() => {
    if (!text) return <p className="text-gray-500 italic">No text provided.</p>;
    if (filter === "none" || highlights.length === 0) {
      return <span className="whitespace-pre-wrap leading-relaxed">{text}</span>;
    }

    // Map sentences to their highlights
    const cleanLines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const fullText = cleanLines.join(" ");
    const rawSentences = fullText.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);

    return rawSentences.map((sentence, idx) => {
      const match = highlights.find(h => {
        if (h.sentence && sentence.includes(h.sentence.slice(0, 25))) return true;
        if (h.text && sentence.includes(h.text.slice(0, 25))) return true;
        return false;
      });

      const shouldHighlight =
        match &&
        (filter === "all" ||
          (filter === "source" && match.type === "source") ||
          (filter === "peer" && match.type === "peer"));

      if (!shouldHighlight) {
        return (
          <span key={idx} className="text-gray-700">
            {sentence}{" "}
          </span>
        );
      }

      const isPeer = match.type === "peer";
      const isSelected = selectedHighlight?.sentence === match.sentence;
      const matchedWordsSet = new Set((match.matched_words || []).map(w => w.toLowerCase()));
      const words = sentence.split(/\s+/);

      return (
        <span
          key={idx}
          onClick={() => setSelectedHighlight(isSelected ? null : match)}
          className={`cursor-pointer rounded px-1 py-0.5 transition-all duration-150 inline ${
            isPeer
              ? isSelected
                ? "bg-rose-200 text-rose-950 ring-2 ring-rose-500 font-medium"
                : "bg-rose-100/80 text-rose-950 border-b-2 border-rose-400 hover:bg-rose-200/90"
              : isSelected
                ? "bg-amber-200 text-amber-950 ring-2 ring-amber-500 font-medium"
                : "bg-amber-100/80 text-amber-950 border-b-2 border-amber-400 hover:bg-amber-200/90"
          }`}
          title={`Click to inspect matched source: ${match.source_title}`}
        >
          {words.map((word, wIdx) => {
            const cleanWord = word.replace(/[^a-zA-Z]/g, "").toLowerCase();
            const isKeywordMatch = matchedWordsSet.has(cleanWord);

            return (
              <span
                key={wIdx}
                className={
                  isKeywordMatch
                    ? isPeer
                      ? "font-bold text-rose-950 underline decoration-rose-500 decoration-1 underline-offset-2"
                      : "font-bold text-amber-950 underline decoration-amber-500 decoration-1 underline-offset-2"
                    : ""
                }
              >
                {word}{" "}
              </span>
            );
          })}
        </span>
      );
    });
  }, [text, highlights, filter, selectedHighlight]);

  return (
    <div className="mt-3 w-full min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
            <span className="text-xs font-black uppercase tracking-wider text-gray-700">
              Plagiarism Highlights
            </span>
          </div>
          {sourceCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              {sourceCount} External {sourceCount === 1 ? "Source" : "Sources"}
            </span>
          )}
          {peerCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200/80 px-2.5 py-0.5 text-xs font-bold text-rose-800">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
              {peerCount} Classmate {peerCount === 1 ? "Match" : "Matches"}
            </span>
          )}
        </div>

        {/* Filter Toggle Buttons */}
        <div className="flex items-center gap-1 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-2.5 py-1 transition ${
              filter === "all"
                ? "bg-emerald-700 text-white shadow-xs font-black"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            }`}
          >
            All ({highlights.length})
          </button>
          {sourceCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("source")}
              className={`rounded-lg px-2.5 py-1 transition ${
                filter === "source"
                  ? "bg-amber-600 text-white shadow-xs font-black"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100"
              }`}
            >
              Sources ({sourceCount})
            </button>
          )}
          {peerCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("peer")}
              className={`rounded-lg px-2.5 py-1 transition ${
                filter === "peer"
                  ? "bg-rose-600 text-white shadow-xs font-black"
                  : "bg-rose-50 text-rose-800 hover:bg-rose-100"
              }`}
            >
              Classmates ({peerCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilter("none")}
            className={`rounded-lg px-2.5 py-1 transition ${
              filter === "none"
                ? "bg-gray-800 text-white shadow-xs font-black"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            }`}
          >
            Plain
          </button>
        </div>
      </div>

      {/* Selected Match Inspector Card */}
      {selectedHighlight ? (
        <div className="my-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white ${
                    selectedHighlight.type === "peer" ? "bg-rose-600" : "bg-amber-600"
                  }`}
                >
                  {selectedHighlight.label || "Source Match"}
                </span>
                <span className="rounded bg-white/90 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                  {selectedHighlight.source_type || "Academic Index"}
                </span>
              </div>
              <h5 className="font-extrabold text-sm text-gray-950 leading-snug break-words">
                {selectedHighlight.source_title}
              </h5>
              {selectedHighlight.source_url && (
                <a
                  href={selectedHighlight.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-900 hover:underline break-all"
                >
                  <span>{selectedHighlight.source_url}</span>
                  <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              {selectedHighlight.matched_words?.length > 0 && (
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-gray-500 font-semibold">Matched words:</span>
                  {selectedHighlight.matched_words.map((w, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-amber-200/80 border border-amber-300/80 px-2 py-0.5 text-[11px] font-bold text-amber-950"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedHighlight(null)}
              className="rounded-md p-1 text-gray-400 hover:bg-amber-100 hover:text-gray-700 transition"
              title="Close inspection"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="my-2.5 flex items-center gap-2 rounded-lg bg-gray-50/80 px-3 py-2 text-xs text-gray-500">
          <span>💡</span>
          <span>Click any highlighted passage in the text below to view its source publication and destination link.</span>
        </div>
      )}

      {/* Highlighted Essay Content Area */}
      <div className="mt-2 max-h-[360px] overflow-y-auto overflow-x-hidden rounded-xl border border-gray-100 bg-gray-50/60 p-4 text-[14px] leading-7 text-gray-800 select-text">
        {renderedContent}
      </div>

      {/* Legend Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-gray-500 border-t border-gray-100 pt-2.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded bg-amber-200/80 border border-amber-400"></span>
          External Database Source Match
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded bg-rose-200/80 border border-rose-400"></span>
          Classmate / Peer Copy Match
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold text-amber-950 underline decoration-amber-500 decoration-1 underline-offset-2">
            Underlined
          </span>
          Key Overlapping Keywords
        </span>
      </div>
    </div>
  );
}
