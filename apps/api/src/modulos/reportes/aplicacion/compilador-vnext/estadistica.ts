export {
  clasificarFuncionEstadistica,
  esFuncionEstadistica,
  ESTADISTICA_EXTERNAL_NON_EQUIVALENT,
  ESTADISTICA_NATIVE_BIGQUERY,
  ESTADISTICA_SQL_FORMULA,
  ESTADISTICA_UDF_REQUIRED,
} from "./estadistica/catalogo.js";
export { emitirFuncionEstadistica } from "./estadistica/emisor.js";
export type {
  ClasificacionFuncionEstadistica,
  ContextoEstadistica,
} from "./estadistica/tipos.js";
