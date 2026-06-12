// flags.js — Feature-Flags. Ein Flag = ein Feature, das fertig verdrahtet,
// aber bewusst noch nicht scharf ist. Umlegen + Cache-Bump in sw.js = Release.

export const FLAGS = Object.freeze({
  // Phase 4 (Scaffold): Foto/URL → Rezept via Vision-Modell.
  // Modul, Route und Review-vor-Speichern existieren; nur der Parse-Schritt
  // ist deaktiviert. Beim Scharfschalten: parseCapture in
  // features/capture/parse.js implementieren (ai/client.js, Vision-Input).
  captureParse: true,
});
