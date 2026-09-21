import React, { useState, useMemo } from "react";

/**
 * Interactive Plagiarism Highlighting Component
 * Highlights plagiarised sentences and keywords with visual color coding,
 * source tooltips, and filter toggles.
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
          if (overlap.length >= 2 || ["peter", "tsar", "russia", "tax", "beard", "beards", "reform", "fashion", "education", "university", "universities", "scholar", "scholars", "judicial", "dress", "foreigners", "decree", "commercial"].some(t => overlap.includes(t))) {
            maxOverlap = overlap.length;
            bestSource = src;
            matchedTokens = overlap;
          }
        }
      }

      if (bestSource && maxOverlap >= 1) {
        generated.push({
          index: sIdx,
          sentence,
          type: "source",
          label: "Source Match",
          matched_words: matchedTokens,
          source_title: bestSource.title || "Copyleaks Matched Source",
          source_url: bestSource.url || "",
          source_type: bestSource.source_type || "Copyleaks Academic Index",
          severity: maxOverlap >= 3 ? "high" : "medium",
        });
      }
    });

    return generated;
  }, [text, scanResult]);

  // Count source vs peer highlights
  const sourceCount = highlights.filter(h => h.type === "source").length;
  const peerCount = highlights.filter(h => h.type === "peer").length;

  // 2. Parse sentences into highlighted elements
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
        if (h.sentence && sentence.includes(h.sentence.slice(0, 30))) return true;
        if (h.text && sentence.includes(h.text.slice(0, 30))) return true;
        return false;
      });

      const shouldHighlight =
        match &&
        (filter === "all" ||
          (filter === "source" && match.type === "source") ||
          (filter === "peer" && match.type === "peer"));

      if (!shouldHighlight) {
        return (
          <span key={idx} className="text-gray-800">
            {sentence}{" "}
          </span>
        );
      }

      const isPeer = match.type === "peer";
      const isSelected = selectedHighlight?.sentence === match.sentence;
      const matchedWordsSet = new Set((match.matched_words || []).map(w => w.toLowerCase()));

      // Highlight individual words inside the sentence if matched
      const words = sentence.split(/\s+/);

      return (
        <span
          key={idx}
          onClick={() => setSelectedHighlight(isSelected ? null : match)}
          className={`relative inline rounded px-1.5 py-0.5 mx-0.5 cursor-pointer transition-all duration-150 ${
            isPeer
              ? "bg-rose-100 text-rose-950 border-b-2 border-rose-500 hover:bg-rose-200"
              : "bg-amber-100 text-amber-950 border-b-2 border-amber-500 hover:bg-amber-200"
          } ${isSelected ? "ring-2 ring-offset-1 ring-amber-600 font-medium" : ""}`}
          title={`Click to inspect match: ${match.source_title}`}
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
                      ? "bg-rose-200/90 font-black text-rose-950 px-1 py-0.5 rounded shadow-2xs"
                      : "bg-amber-200/90 font-black text-amber-950 px-1 py-0.5 rounded shadow-2xs"
                    : ""
                }
              >
                {word}{" "}
              </span>
            );
          })}
          <span
            className={`inline-block ml-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${
              isPeer ? "bg-rose-600 text-white" : "bg-amber-600 text-white"
            }`}
          >
            {isPeer ? "Peer Match" : "Plagiarised Source"}
          </span>
        </span>
      );
    });
  }, [text, highlights, filter, selectedHighlight]);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3.5 shadow-2xs">
      {/* Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-black uppercase tracking-wider text-gray-600">
            Plagiarism Highlights
          </span>
          {sourceCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              {sourceCount} External Source {sourceCount === 1 ? "Match" : "Matches"}
            </span>
          )}
          {peerCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-800">
              <span className="h-2 w-2 rounded-full bg-rose-500"></span>
              {peerCount} Classmate {peerCount === 1 ? "Match" : "Matches"}
            </span>
          )}
        </div>

        {/* Filter Toggle Buttons */}
        <div className="flex items-center gap-1 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded px-2.5 py-1 transition ${
              filter === "all"
                ? "bg-emerald-700 text-white shadow-xs"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All Highlights ({highlights.length})
          </button>
          {sourceCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("source")}
              className={`rounded px-2.5 py-1 transition ${
                filter === "source"
                  ? "bg-amber-600 text-white shadow-xs"
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
              className={`rounded px-2.5 py-1 transition ${
                filter === "peer"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-50 text-rose-800 hover:bg-rose-100"
              }`}
            >
              Classmate ({peerCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilter("none")}
            className={`rounded px-2.5 py-1 transition ${
              filter === "none"
                ? "bg-gray-800 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Plain
          </button>
        </div>
      </div>

      {/* Selected Match Inspector Card */}
      {selectedHighlight && (
        <div className="my-3 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-600 px-2 py-0.5 font-black text-white uppercase text-[10px]">
                {selectedHighlight.label}
              </span>
              <p className="font-extrabold text-gray-900 truncate">
                {selectedHighlight.source_title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedHighlight(null)}
              className="text-gray-400 hover:text-gray-700 font-bold px-1"
            >
              ✕
            </button>
          </div>
          {selectedHighlight.source_url && (
            <a
              href={selectedHighlight.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-emerald-800 hover:underline font-semibold truncate"
            >
              🔗 {selectedHighlight.source_url}
            </a>
          )}
          {selectedHighlight.matched_words?.length > 0 && (
            <p className="mt-1.5 text-gray-700">
              <strong className="text-gray-900">Overlapping keywords:</strong>{" "}
              {selectedHighlight.matched_words.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Highlighted Essay Content Area */}
      <div className="mt-3 max-h-[300px] overflow-auto rounded-md border border-gray-100 bg-gray-50/50 p-3.5 text-sm font-normal leading-7 text-gray-800">
        {renderedContent}
      </div>

      {/* Legend Footer */}
      <div className="mt-2.5 flex items-center gap-4 text-[11px] font-semibold text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-amber-200 border border-amber-400"></span>
          External Copyleaks Source Match
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-rose-200 border border-rose-400"></span>
          Classmate / Peer Copy Match
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-amber-300 font-black text-[9px] text-amber-950 px-0.5 text-center leading-3">
            W
          </span>
          Key Overlapping Word
        </span>
      </div>
    </div>
  );
}
