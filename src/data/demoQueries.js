// Chat chips for the §8 demo script, in script order. Answers always come from the backend (/ask);
// only the question and the as-of date the chip sets live here. Expected answers: data/ground-truth.json.
const today = () => new Date().toLocaleDateString("en-CA");

export const DEMO_QUERIES = [
  { id: "q-1", shortLabel: "Project Atlas History", query: "Show the history of Project Atlas.", asOfDateSuggested: today() },
  { id: "q-2", shortLabel: "Why We Left AWS (May 2025)", query: "Why did we move off AWS in May 2025?", asOfDateSuggested: "2025-06-01" },
  // Today, so the answer contrasts "compliant then" (PROC-3.1 v1) with "needs CEO sign-off now" (v2).
  { id: "q-3", shortLabel: "VendorCo Contract Approval (Mar 2025)", query: "Was the ₹4 lakh VendorCo contract approved correctly in March 2025?", asOfDateSuggested: today() },
  { id: "q-4", shortLabel: "180-Day Retention in Q2 2025", query: "Was keeping customer logs for 180 days compliant in Q2 2025?", asOfDateSuggested: "2025-06-30" },
  { id: "q-5", shortLabel: "Trick Query (MongoDB Choice)", query: "Why did we choose MongoDB?", asOfDateSuggested: today() },
];
