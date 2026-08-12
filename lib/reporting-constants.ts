// Shared constants for reporting/forecasting. Kept out of lib/actions/reporting.ts
// because that file has a "use server" directive, which only allows async
// function exports — a plain `const` export there breaks the production build.

// Below this many completed samples, percentiles are indicative only — flagged
// via `lowConfidence` rather than hidden, since informational is the point.
export const MIN_CLASS_SAMPLES = 8;

// Faixa de referência de utilização (horas ÷ meta prorrateada). Por P7,
// utilização é GUARDA DE SOBRECARGA/ÓCIO, não instrumento de planejamento nem
// nota: os benchmarks de agência não passaram por verificação adversarial, então
// a faixa é aproximada de propósito e a UI a desenha como região, nunca como
// aprovado/reprovado. Alinhada a BURNOUT_UTIL_HIGH (0.9) em team-health.
export const UTILIZATION_BAND_MIN = 0.6;
export const UTILIZATION_BAND_MAX = 0.9;
// Fim da régua. Passar de 100% é possível e comum (hora extra), então a escala
// precisa de folga acima de 1 — senão quem estourou some encostado na borda.
export const UTILIZATION_SCALE_MAX = 1.2;

/** A faixa completa, no formato que `utilizationMeter` espera. */
export const UTILIZATION_BAND = {
  min: UTILIZATION_BAND_MIN,
  max: UTILIZATION_BAND_MAX,
  scaleMax: UTILIZATION_SCALE_MAX,
};
