export interface FormularioSetupData {
  organizacionNombre: string;
  qlikTenantHost: string;
  qlikClientId: string;
  qlikClientSecret: string;
  qlikScopes: string[];
  superadminNombre: string;
  superadminCorreo: string;
  qlikRedirectUri: string;
}

export function Paso1Empresa({
  formulario,
  actualizarCampo,
}: {
  formulario: FormularioSetupData;
  actualizarCampo: <K extends keyof FormularioSetupData>(
    campo: K,
    valor: FormularioSetupData[K],
  ) => void;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-semibold text-ink-900">Empresa</legend>
      <p className="-mt-2 text-sm text-ink-600">
        Nombre con el que se registrará tu organización en el sistema.
      </p>
      <div>
        <label
          htmlFor="organizacionNombre"
          className="block text-sm font-medium text-ink-700"
        >
          Nombre de la empresa <span className="text-danger-600">*</span>
        </label>
        <input
          id="organizacionNombre"
          type="text"
          value={formulario.organizacionNombre}
          onChange={(e) =>
            actualizarCampo("organizacionNombre", e.target.value)
          }
          placeholder="Ej. Mi Empresa S.A."
          className="mt-1 block w-full rounded-md border border-line-200 bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          required
        />
      </div>
    </fieldset>
  );
}
