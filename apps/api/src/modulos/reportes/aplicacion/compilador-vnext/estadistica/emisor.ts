import type { ExprQlik } from "../expresiones-qlik.js";
import { classifications } from "./catalogo.js";
import {
  emitBinomDist,
  emitBinomFrequency,
  emitFractile,
  emitMedian,
  emitMoment,
  emitPoissonDist,
  emitPoissonFrequency,
  emitSterr,
} from "./distribuciones.js";
import {
  emitChi2,
  emitOneSampleTest,
  emitOneSampleWeightedTest,
  emitTwoSampleTest,
  emitZTest,
} from "./pruebas.js";
import { emitLinest } from "./regresion.js";
import type { ContextoEstadistica } from "./tipos.js";
import {
  distinctPrefix,
  requireArity,
  requiredArgument,
  validateModifiers,
} from "./validacion.js";

export function emitirFuncionEstadistica(
  name: string,
  args: ExprQlik[],
  modifiers: readonly string[],
  context: ContextoEstadistica,
): string {
  const key = name.toLowerCase();
  const classification = classifications.get(key);
  if (!classification)
    return context.fail(
      "STATISTICS_UNKNOWN_FUNCTION",
      `${name} no pertenece al conjunto estadístico dedicado`,
    );
  if (classification === "udf_required")
    return context.fail(
      "STATISTICS_REQUIRES_EXACT_UDF",
      `${name} requiere una UDF exacta: BigQuery no expone la CDF/inversa o la función especial equivalente sin aproximar`,
    );
  if (classification === "external_non_equivalent")
    return context.fail(
      "STATISTICS_EXTERNAL_NON_EQUIVALENT",
      `${name} requiere la semántica estadística externa de Qlik y no tiene un equivalente BigQuery exacto`,
    );

  validateModifiers(
    name,
    modifiers,
    key === "stdev" || key === "kurtosis" || key === "skew" || key === "sterr",
    context,
  );

  if (key === "correl") {
    requireArity(name, args, 2, context);
    return `CORR(${context.emitNumeric(requiredArgument(args, 0, context))}, ${context.emitNumeric(requiredArgument(args, 1, context))})`;
  }
  if (key === "stdev") {
    requireArity(name, args, 1, context);
    return `STDDEV_SAMP(${distinctPrefix(modifiers)}${context.emitNumeric(requiredArgument(args, 0, context))})`;
  }
  if (key === "binomfrequency") return emitBinomFrequency(name, args, context);
  if (key === "binomdist") return emitBinomDist(name, args, context);
  if (key === "poissonfrequency")
    return emitPoissonFrequency(name, args, context);
  if (key === "poissondist") return emitPoissonDist(name, args, context);
  if (key === "fractile" || key === "fractileexc")
    return emitFractile(name, key === "fractileexc", args, context);
  if (key === "median") return emitMedian(name, args, context);
  if (key === "sterr") return emitSterr(name, args, modifiers, context);
  if (key === "skew" || key === "kurtosis")
    return emitMoment(name, key, args, modifiers, context);
  if (key.startsWith("linest_"))
    return emitLinest(name, key.slice("linest_".length), args, context);
  if (key === "steyx") return emitLinest(name, "sey", args, context);
  if (key.startsWith("ttest1w_"))
    return emitOneSampleWeightedTest(
      name,
      key.slice("ttest1w_".length),
      args,
      context,
    );
  if (key.startsWith("ttest1_"))
    return emitOneSampleTest(name, key.slice("ttest1_".length), args, context);
  if (key.startsWith("ttestw_"))
    return emitTwoSampleTest(
      name,
      key.slice("ttestw_".length),
      args,
      true,
      context,
    );
  if (key.startsWith("ttest_"))
    return emitTwoSampleTest(
      name,
      key.slice("ttest_".length),
      args,
      false,
      context,
    );
  if (key.startsWith("ztestw_"))
    return emitZTest(name, key.slice("ztestw_".length), args, true, context);
  if (key.startsWith("ztest_"))
    return emitZTest(name, key.slice("ztest_".length), args, false, context);
  if (key === "chi2test_chi2" || key === "chi2test_df")
    return emitChi2(name, key.endsWith("_df"), args, context);
  return context.fail(
    "STATISTICS_IMPLEMENTATION_MISSING",
    `${name} está clasificada como estadística exacta pero no tiene lowering`,
  );
}
