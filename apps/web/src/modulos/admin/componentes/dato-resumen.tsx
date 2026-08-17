export function DatoResumen({
  etiqueta,
  valor,
}: {
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {etiqueta}
      </span>
      <span
        className="mt-1 block truncate font-mono text-sm text-ink-900"
        title={valor}
      >
        {valor}
      </span>
    </div>
  );
}
