import { CronExpressionParser } from "cron-parser";

export function calcularProximaEjecucion(
  expresionCron: string,
  zonaHoraria: string,
  desde: Date,
): Date {
  const expresion = CronExpressionParser.parse(expresionCron, {
    currentDate: desde,
    tz: zonaHoraria,
  });
  return expresion.next().toDate();
}
