import postgres from "postgres";
import { crearServicioCifrado } from "./src/plataforma/seguridad/servicio-cifrado.ts";
import { ClienteHttpQlik } from "./src/modulos/qlik/infraestructura/cliente-http-qlik.ts";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const [row] = await sql`
  select c.token_acceso_cifrado, c.token_expira_en, t.host
  from credenciales_qlik c
  join identidades_qlik i on i.id = c.identidad_qlik_id
  join tenants_qlik t on t.id = i.tenant_qlik_id
  where i.usuario_id = ${"2268bf30-2e45-4dea-b721-42c46411e69d"}
    and i.tenant_qlik_id = ${"3b70f4e8-c3a5-4bf8-89fa-5e3c23d4b5fa"}
  order by c.actualizado_en desc limit 1`;
if (!row) throw new Error("sin credencial qlik");
console.log("credential-expiry", row.token_expira_en);
const enc = JSON.parse(row.token_acceso_cifrado);
const token = crearServicioCifrado().descifrar(enc.cifrado, enc.iv, enc.tag);
const qlik = new ClienteHttpQlik(row.host, token);
const ids = {
  template: "266e76f0-fa37-4ae2-8c43-4ac6b4518432",
  worker: "0c7cc08b-ee93-4d98-a3a1-97a086268c86",
};

function summarize(a: any) {
  const blocks = Array.isArray(a.workspace?.blocks) ? a.workspace.blocks : [];
  const names = [
    "executeTask", "JobId", "jobid", "ProjectId", "projectid",
    "sql", "Credenciales", "BqNumberCsv", "BqExportData",
  ];
  const interesting = blocks.filter((b: any) => names.includes(String(b?.name)));
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    maxConcurrentRuns: a.maxConcurrentRuns,
    blocks: interesting.map((b: any) => {
      if (b.name === "executeTask") {
        const inputs = Array.isArray(b.inputs) ? b.inputs : [];
        const kv = inputs.find((i: any) => i?.mode === "keyValue" && Array.isArray(i.value));
        return {
          id: b.id,
          childId: b.childId,
          name: b.name,
          endpointGuid: b.endpoint_guid,
          datasourceGuid: b.datasourcetype_guid,
          context: (kv?.value ?? []).map((x: any) => ({ key: x.key, value: x.value })),
        };
      }
      const ops = Array.isArray(b.operations) ? b.operations : [];
      const sv = ops.find((o: any) => o?.id === "set_value");
      let value = sv?.value;
      if (b.name === "sql" && typeof value === "string") {
        value = `<sql length=${value.length} prefix=${JSON.stringify(value.slice(0, 45))}>`;
      }
      return { id: b.id, childId: b.childId, name: b.name, setValue: value };
    }),
  };
}

for (const [kind, id] of Object.entries(ids)) {
  const automation = await qlik.obtenerAutomatizacion(id);
  console.log(`--- ${kind} ---`);
  console.log(JSON.stringify(summarize(automation), null, 2));
}

await sql.end();
