// export.js — Markdown-Export der ganzen Sammlung (v1-Parität P10.1).
// exportMarkdown ist pur und unit-getestet; copyExport macht die Zwischenablage.

import { CATEGORIES } from "../../data/schema.js";
import { buildExportFile, exportFileName } from "../../data/recipeExport.js";

export function exportMarkdown(recipes) {
  let md = "# 📖 Rezept-Datenbank\n\n";
  for (const cat of CATEGORIES) {
    const items = recipes.filter((r) => r.category === cat);
    if (!items.length) continue;
    md += `## ${cat}\n\n`;
    for (const r of items) {
      md += `### ${r.name}${r.rating ? ` (${"★".repeat(r.rating)})` : ""}\n`;
      md += `**Zeit:** ${r.time || "—"} | **Portionen:** ${r.servings || "—"} | **Zuletzt:** ${r.lastCooked || "—"}\n\n`;
      md += `#### Zutaten\n${(r.ingredients || []).map((i) => "- " + i).join("\n")}\n\n`;
      md += `#### Zubereitung\n${(r.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n`;
      if (r.tips) md += `#### Tipps\n${r.tips}\n\n`;
    }
  }
  return md;
}

export async function copyExport(recipes) {
  const md = exportMarkdown(recipes);
  try {
    await navigator.clipboard.writeText(md);
    alert("Markdown in Zwischenablage kopiert!");
  } catch (e) {
    alert("Zwischenablage nicht verfügbar: " + e.message);
  }
}

/** Export-Datei teilen (Share-Sheet mit Datei) oder als Download anbieten; Abbruch ist still. */
export async function deliverExportFile(file, name) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const f = new File([blob], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try {
      await navigator.share({ files: [f], title: name });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFile(recipes) {
  return deliverExportFile(buildExportFile(recipes), exportFileName(recipes));
}
