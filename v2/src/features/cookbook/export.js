// export.js — Markdown-Export der ganzen Sammlung (v1-Parität P10.1).
// exportMarkdown ist pur und unit-getestet; copyExport macht die Zwischenablage.

import { CATEGORIES } from "../../data/schema.js";
import { t } from "../../i18n.js";
import { buildExportFile, exportFileName } from "../../data/recipeExport.js";

// Markdown ist immer Englisch (G2-Q3): feste Labels, unabhängig von der UI-Sprache.
// Rezepttext selbst wird so exportiert, wie er gespeichert ist.
export const CATEGORY_LABELS_EN = Object.freeze({
  "Frühstück & Brunch": "Breakfast & Brunch",
  "Schnelle Wochentags-Gerichte": "Quick weekday dishes",
  "Pasta & Nudeln": "Pasta & noodles",
  "Reis & Getreide": "Rice & grains",
  "Suppen & Eintöpfe": "Soups & stews",
  "Salate & leichte Gerichte": "Salads & light dishes",
  "Wochenend-Gerichte": "Weekend dishes",
  "Vegetarische Hauptgerichte": "Vegetarian mains",
  "Deutsche Hausmannskost": "German home cooking",
  "Middle Eastern & Mediterran": "Middle Eastern & Mediterranean",
  "Asiatisch inspiriert": "Asian-inspired",
  "Backen: Brot & Herzhaftes": "Baking: bread & savoury",
  "Backen: Süßes & Kuchen": "Baking: sweet & cakes",
  "Muffins & Kleingebäck": "Muffins & small bakes",
  "Sourdough & Sauerteig": "Sourdough",
  "Grundrezepte & Basissoßen": "Basic recipes & sauces",
});

const title = (r) => `${r.name}${r.rating ? ` (${"★".repeat(r.rating)})` : ""}`;
const ingredientsMd = (r) => (r.ingredients || []).map((i) => "- " + i).join("\n");
const stepsMd = (r) => (r.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n");

export function exportMarkdown(recipes) {
  let md = "# 📖 Recipe collection\n\n";
  for (const cat of CATEGORIES) {
    const items = recipes.filter((r) => r.category === cat);
    if (!items.length) continue;
    md += `## ${CATEGORY_LABELS_EN[cat]}\n\n`;
    for (const r of items) {
      md += `### ${title(r)}\n`;
      md += `**Time:** ${r.time || "—"} | **Servings:** ${r.servings || "—"} | **Last cooked:** ${r.lastCooked || "—"}\n\n`;
      md += `#### Ingredients\n${ingredientsMd(r)}\n\n`;
      md += `#### Instructions\n${stepsMd(r)}\n\n`;
      if (r.tips) md += `#### Tips\n${r.tips}\n\n`;
    }
  }
  return md;
}

/** Ein Rezept als lesbares Markdown zum Teilen (Labels immer Englisch). */
export function recipeToMarkdown(r) {
  let md = `# ${title(r)}\n`;
  if (CATEGORY_LABELS_EN[r.category]) md += `*${CATEGORY_LABELS_EN[r.category]}*\n`;
  md += `\n**Time:** ${r.time || "—"} | **Servings:** ${r.servings || "—"}\n\n`;
  md += `## Ingredients\n${ingredientsMd(r)}\n\n`;
  md += `## Instructions\n${stepsMd(r)}\n`;
  if (r.tips) md += `\n## Tips\n${r.tips}\n`;
  return md;
}

/** Text teilen (Share-Sheet) oder in die Zwischenablage kopieren → "shared" | "copied" | "cancelled". */
export async function shareRecipeText(text, name, nav = navigator) {
  if (nav.share) {
    try {
      await nav.share({ text, title: name });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
      // sonst: auf Zwischenablage zurückfallen
    }
  }
  await nav.clipboard.writeText(text);
  return "copied";
}

export async function copyExport(recipes) {
  const md = exportMarkdown(recipes);
  try {
    await navigator.clipboard.writeText(md);
    alert(t("export.copied"));
  } catch (e) {
    alert(t("export.copyFail", { msg: e.message }));
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
