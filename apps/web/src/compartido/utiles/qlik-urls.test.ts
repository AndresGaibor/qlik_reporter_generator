import { expect, test } from "vitest";
import { construirUrlVerFlujoQlik } from "./qlik-urls";

test("abre los Dataflows directamente en el editor de Qlik", () => {
  expect(
    construirUrlVerFlujoQlik(
      "https://tenant.qlikcloud.com/",
      "dca3bf89-3407-4047-9624-88707c554ca6",
    ),
  ).toBe(
    "https://tenant.qlikcloud.com/dataflow/dca3bf89-3407-4047-9624-88707c554ca6/editor",
  );
});
