type TamMarca = "sm" | "md" | "lg";

const CLASES: Record<TamMarca, { qlik: string; report: string; separador: string }> = {
  sm: { qlik: "text-[18px]", report: "text-[16px]", separador: "h-5" },
  md: { qlik: "text-[22px]", report: "text-[19px]", separador: "h-6" },
  lg: { qlik: "text-[30px]", report: "text-[26px]", separador: "h-8" },
};

export function MarcaQlikReport({ tam = "md" }: { tam?: TamMarca }) {
  const clases = CLASES[tam];

  return (
    <div className="inline-flex items-center gap-2.5" aria-label="Qlik Report">
      <span className={`${clases.qlik} font-display font-bold leading-none tracking-[-0.045em] text-brand-600`}>
        Qlik
      </span>
      <span className={`${clases.separador} w-px bg-line-300`} aria-hidden="true" />
      <span className={`${clases.report} font-display font-medium leading-none tracking-tight text-ink-700`}>
        Report
      </span>
    </div>
  );
}
