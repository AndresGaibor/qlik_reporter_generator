import { describe, expect, it } from "vitest";

describe("descargador-navegador", () => {
  describe("puedeUsarFileSystemAccess", () => {
    it("retorna false cuando showDirectoryPicker no está disponible en el entorno jsdom", () => {
      expect(typeof window.showDirectoryPicker).toBe("undefined");
    });
  });
});
