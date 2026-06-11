// catalog.js — Supermarkt-Katalog (14 Gänge, aus v1 übernommen) + Zuordnung
// von Freitext-Zutaten zu Gängen. Pur, unit-testbar.

export const CATALOG = [
  { name: "Gemüse", icon: "🥦", items: [
    { name: "Brokkoli", icon: "🥦" }, { name: "Karotten", icon: "🥕" }, { name: "Zwiebeln", icon: "🧅" }, { name: "Knoblauch", icon: "🧄" },
    { name: "Tomaten", icon: "🍅" }, { name: "Paprika", icon: "🫑" }, { name: "Gurke", icon: "🥒" }, { name: "Kartoffeln", icon: "🥔" },
    { name: "Süßkartoffel", icon: "🍠" }, { name: "Salat", icon: "🥬" }, { name: "Spinat", icon: "🥬" }, { name: "Zucchini", icon: "🥒" },
    { name: "Aubergine", icon: "🍆" }, { name: "Champignons", icon: "🍄" }, { name: "Mais", icon: "🌽" }, { name: "Blumenkohl", icon: "🥦" },
    { name: "Lauch", icon: "🥬" }, { name: "Avocado", icon: "🥑" }, { name: "Ingwer", icon: "🫚" }, { name: "Chili", icon: "🌶️" } ] },
  { name: "Obst", icon: "🍎", items: [
    { name: "Äpfel", icon: "🍎" }, { name: "Bananen", icon: "🍌" }, { name: "Orangen", icon: "🍊" }, { name: "Zitronen", icon: "🍋" },
    { name: "Limetten", icon: "🍋" }, { name: "Trauben", icon: "🍇" }, { name: "Erdbeeren", icon: "🍓" }, { name: "Blaubeeren", icon: "🫐" },
    { name: "Birnen", icon: "🍐" }, { name: "Kiwi", icon: "🥝" }, { name: "Mango", icon: "🥭" }, { name: "Ananas", icon: "🍍" },
    { name: "Wassermelone", icon: "🍉" }, { name: "Datteln", icon: "🌴" } ] },
  { name: "Milch & Eier", icon: "🥛", items: [
    { name: "Milch", icon: "🥛" }, { name: "Eier", icon: "🥚" }, { name: "Butter", icon: "🧈" }, { name: "Naturjoghurt", icon: "🥛" },
    { name: "Joghurt", icon: "🥛" }, { name: "Sahne", icon: "🥛" }, { name: "Quark", icon: "🥛" }, { name: "Skyr", icon: "🥛" },
    { name: "Buttermilch", icon: "🥛" }, { name: "Hafermilch", icon: "🌾" } ] },
  { name: "Käse", icon: "🧀", items: [
    { name: "Gouda", icon: "🧀" }, { name: "Mozzarella", icon: "🧀" }, { name: "Parmesan", icon: "🧀" }, { name: "Feta", icon: "🧀" },
    { name: "Frischkäse", icon: "🧀" }, { name: "Halloumi", icon: "🧀" }, { name: "Reibekäse", icon: "🧀" } ] },
  { name: "Fleisch & Fisch", icon: "🥩", items: [
    { name: "Hähnchen", icon: "🍗" }, { name: "Hackfleisch", icon: "🥩" }, { name: "Speck", icon: "🥓" }, { name: "Lachs", icon: "🐟" },
    { name: "Thunfisch", icon: "🐟" }, { name: "Garnelen", icon: "🦐" }, { name: "Schinken", icon: "🍖" }, { name: "Wurst", icon: "🌭" } ] },
  { name: "Vegetarisch", icon: "🌱", items: [
    { name: "Tofu", icon: "🧊" }, { name: "Tempeh", icon: "🌱" }, { name: "Hummus", icon: "🥣" }, { name: "Falafel", icon: "🧆" },
    { name: "Veggie-Burger", icon: "🍔" }, { name: "Sojaschnetzel", icon: "🌱" } ] },
  { name: "Nudeln, Reis & Co.", icon: "🍝", items: [
    { name: "Nudeln (Fusilli)", icon: "🍝" }, { name: "Spaghetti", icon: "🍝" }, { name: "Penne", icon: "🍝" }, { name: "Reis", icon: "🍚" },
    { name: "Basmatireis", icon: "🍚" }, { name: "Couscous", icon: "🌾" }, { name: "Bulgur", icon: "🌾" }, { name: "Quinoa", icon: "🌾" },
    { name: "Haferflocken", icon: "🌾" }, { name: "Mehl", icon: "🌾" }, { name: "Lasagneplatten", icon: "🍝" } ] },
  { name: "Konserven & Vorrat", icon: "🥫", items: [
    { name: "Dosentomaten", icon: "🥫" }, { name: "Tomatenmark", icon: "🥫" }, { name: "Kokosmilch", icon: "🥥" }, { name: "Kichererbsen (Dose)", icon: "🫘" },
    { name: "Bohnen (Dose)", icon: "🫘" }, { name: "Mais (Dose)", icon: "🌽" }, { name: "Linsen", icon: "🫘" }, { name: "Oliven", icon: "🫒" },
    { name: "Brühe", icon: "🥣" }, { name: "Erdnussbutter", icon: "🥜" }, { name: "Honig", icon: "🍯" }, { name: "Marmelade", icon: "🍓" } ] },
  { name: "Gewürze & Öl", icon: "🧂", items: [
    { name: "Salz", icon: "🧂" }, { name: "Pfeffer", icon: "🧂" }, { name: "Olivenöl", icon: "🫒" }, { name: "Sonnenblumenöl", icon: "🌻" },
    { name: "Essig", icon: "🫗" }, { name: "Sojasauce", icon: "🥢" }, { name: "Zucker", icon: "🍬" }, { name: "Currypulver", icon: "🍛" },
    { name: "Paprikapulver", icon: "🌶️" }, { name: "Kreuzkümmel", icon: "🌿" }, { name: "Chiliflocken", icon: "🌶️" }, { name: "Oregano", icon: "🌿" },
    { name: "Backpulver", icon: "🧁" }, { name: "Senf", icon: "🟡" }, { name: "Ketchup", icon: "🍅" }, { name: "Mayonnaise", icon: "🥚" } ] },
  { name: "Brot & Backwaren", icon: "🍞", items: [
    { name: "Brot", icon: "🍞" }, { name: "Vollkornbrot", icon: "🍞" }, { name: "Toast", icon: "🍞" }, { name: "Brötchen", icon: "🥖" },
    { name: "Baguette", icon: "🥖" }, { name: "Tortillas", icon: "🌯" }, { name: "Croissant", icon: "🥐" }, { name: "Knäckebrot", icon: "🍘" } ] },
  { name: "Tiefkühl", icon: "🧊", items: [
    { name: "TK-Erbsen", icon: "🫛" }, { name: "TK-Spinat", icon: "🥬" }, { name: "TK-Beeren", icon: "🫐" }, { name: "TK-Gemüse", icon: "🥦" },
    { name: "Pizza", icon: "🍕" }, { name: "Pommes", icon: "🍟" }, { name: "Eis", icon: "🍦" } ] },
  { name: "Getränke", icon: "🥤", items: [
    { name: "Wasser", icon: "💧" }, { name: "Sprudelwasser", icon: "💧" }, { name: "Orangensaft", icon: "🧃" }, { name: "Saft", icon: "🧃" },
    { name: "Kaffee", icon: "☕" }, { name: "Tee", icon: "🍵" }, { name: "Bier", icon: "🍺" }, { name: "Wein", icon: "🍷" }, { name: "Cola", icon: "🥤" } ] },
  { name: "Snacks & Süßes", icon: "🍫", items: [
    { name: "Schokolade", icon: "🍫" }, { name: "Chips", icon: "🥔" }, { name: "Kekse", icon: "🍪" }, { name: "Nüsse", icon: "🥜" },
    { name: "Müsliriegel", icon: "🍫" }, { name: "Popcorn", icon: "🍿" }, { name: "Cracker", icon: "🍘" } ] },
  { name: "Haushalt & Drogerie", icon: "🧴", items: [
    { name: "Klopapier", icon: "🧻" }, { name: "Küchenrolle", icon: "🧻" }, { name: "Spülmittel", icon: "🧴" }, { name: "Müllbeutel", icon: "🗑️" },
    { name: "Zahnpasta", icon: "🪥" }, { name: "Shampoo", icon: "🧴" }, { name: "Seife", icon: "🧼" }, { name: "Waschmittel", icon: "🧺" },
    { name: "Alufolie", icon: "🌫️" }, { name: "Frischhaltefolie", icon: "🌫️" }, { name: "Backpapier", icon: "📄" } ] },
];

/** Anzeige-Reihenfolge der Gänge in der Liste (v1: Katalog-Reihenfolge + Sonderfächer). */
export const SECTION_ORDER = [...CATALOG.map((s) => s.name), "Aus Rezepten", "Sonstiges"];

/**
 * Ordnet eine Freitext-Zutat einem Katalog-Gang zu. Substring-Match gegen
 * Katalog-Artikel (ohne Klammerzusatz); der LÄNGSTE Treffer gewinnt —
 * "Kokosmilch" schlägt "Milch" (v1 nahm den ersten Treffer und lag da daneben).
 */
export function ingMatchCat(text) {
  const low = (text || "").toLowerCase();
  let best = null, bestLen = 0;
  for (const sec of CATALOG) {
    for (const it of sec.items) {
      const base = it.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim();
      if (base.length >= 3 && base.length > bestLen && low.includes(base)) {
        best = { cat: sec.name, icon: it.icon || sec.icon };
        bestLen = base.length;
      }
    }
  }
  return best;
}

export function sectionIcon(name) {
  const sec = CATALOG.find((s) => s.name === name);
  if (sec) return sec.icon;
  if (name === "Aus Rezepten") return "🍳";
  return "🛒";
}
