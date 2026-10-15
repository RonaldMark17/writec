// Authored illustrative essay cards and prepared transcripts, not OCR benchmarks.
export const DEMO_KEY = "writecheck-guest-demo-v1";
export const reference = "A community grows when people help one another.";
export const samples = [
  { id: "community", label: "Community essay", image: "/demo/community.svg", text: "A community grows when people help one another. Last weekend, our class cleaned the local park. We collected litter and planted young trees. Working together taught me to listen and share. Small acts of service can make a lasting difference." },
  { id: "reading", label: "Reading essay", image: "/demo/reading.svg", text: "Reading opens a window into another life. A story helps us understand unfamiliar experiences. In our classroom, we discuss what characters choose. These conversations teach us to question and reflect. Books make room for curiosity in our everyday lives." },
];
export function compareDemo(text) {
  const index = text.toLowerCase().indexOf(reference.toLowerCase());
  return { text, index, words: text.trim().split(/\s+/).filter(Boolean).length };
}
