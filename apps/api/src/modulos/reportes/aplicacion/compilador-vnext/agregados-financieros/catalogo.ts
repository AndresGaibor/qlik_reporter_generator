export const RANGE_FUNCTIONS = new Set([
  "rangecorrel",
  "rangefractile",
  "rangeirr",
  "rangekurtosis",
  "rangemaxstring",
  "rangeminstring",
  "rangemode",
  "rangeonly",
  "rangenpv",
  "rangeskew",
  "rangestdev",
  "rangexirr",
  "rangexnpv",
]);

export const GROUPED_FUNCTIONS = new Set([
  "concat",
  "firstsortedvalue",
  "firstvalue",
  "irr",
  "lastvalue",
  "maxstring",
  "minstring",
  "mode",
  "npv",
  "only",
  "xirr",
  "xnpv",
]);

export const SCALAR_FINANCIAL_FUNCTIONS = new Set([
  "blackandschole",
  "fv",
  "nper",
  "pmt",
  "pv",
  "rate",
]);

export function esAgregadoFinancieroQlik(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    RANGE_FUNCTIONS.has(normalized) ||
    GROUPED_FUNCTIONS.has(normalized) ||
    SCALAR_FINANCIAL_FUNCTIONS.has(normalized)
  );
}
