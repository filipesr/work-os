// Shared constants for reporting/forecasting. Kept out of lib/actions/reporting.ts
// because that file has a "use server" directive, which only allows async
// function exports — a plain `const` export there breaks the production build.

// Below this many completed samples, percentiles are indicative only — flagged
// via `lowConfidence` rather than hidden, since informational is the point.
export const MIN_CLASS_SAMPLES = 8;
