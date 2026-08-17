import type { FormularioSetupData } from "./paso-1-empresa";

export function Paso3Admin({
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
    <fieldset className="space-y-5">
      <legend className="text-base font-semibold text-ink-900">
        Administrador inicial
      </legend>
      <p className="-mt-3 text-sm text-ink-600">
        Esta persona administrará la empresa después de iniciar sesión con
        Qlik.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="superadminNombre"
            className="mb-1.5 block text-sm font-medium text-ink-700"
          >
            Nombre completo
          </label>
          <input
            id="superadminNombre"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            value={formulario.superadminNombre}
            onChange={(evento) =>
              actualizarCampo("superadminNombre", evento.target.value)
            }
            placeholder="Nombre Apellido"
            className="w-full rounded-md border border-line-200 bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label
            htmlFor="superadminCorreo"
            className="mb-1.5 block text-sm font-medium text-ink-700"
          >
            Correo electrónico
          </label>
          <input
            id="superadminCorreo"
            type="email"
            required
            autoComplete="email"
            value={formulario.superadminCorreo}
            onChange={(evento) =>
              actualizarCampo("superadminCorreo", evento.target.value)
            }
            placeholder="nombre@empresa.com"
            className="w-full rounded-md border border-line-200 bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
    </fieldset>
  );
}
