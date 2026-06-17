// i18n.js — Mehrsprachigkeit (DE Standard, EN, ES). Sprache in localStorage
// (kochv2_lang) für synchronen Erst-Render ohne Flackern. t(key, params)
// löst Punkt-Pfade auf; fehlt ein Key, Fallback auf DE, dann auf den Key selbst.
// Rezeptinhalte bleiben in der Eingabesprache — übersetzt wird nur das UI.
// WICHTIG: in Werten niemals ein gerades " verwenden (außer escaped \"),
// sonst bricht der String. Anführungen als curly: DE „ … “ · EN/ES “ … ”.

const LANG_KEY = "kochv2_lang";

export const LANGS = [
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "da", label: "Dansk", flag: "🇩🇰" },
];

const listeners = new Set();
let current = null;

export function hasLang() {
  try { return !!localStorage.getItem(LANG_KEY); } catch (e) { return false; }
}
export function getLang() {
  if (current) return current;
  try { current = localStorage.getItem(LANG_KEY); } catch (e) { current = null; }
  if (!LANGS.some((l) => l.code === current)) current = "de";
  return current;
}
export function setLang(code) {
  if (!LANGS.some((l) => l.code === code)) return;
  current = code;
  try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* egal */ }
  if (typeof document !== "undefined") document.documentElement.setAttribute("lang", code);
  for (const fn of listeners) fn(code);
}
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** t("nav.cookbook") · t("cookbook.count", {n:5}) */
export function t(key, params) {
  const lang = getLang();
  let val = walk(DICT[lang], key);
  if (val === undefined && lang !== "de") val = walk(DICT.de, key);
  if (val === undefined) return key;
  if (params) for (const [k, v] of Object.entries(params)) val = val.replaceAll(`{${k}}`, v);
  return val;
}
function walk(obj, key) {
  return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Plural-Helfer: tn("cookbook.count", n) → wählt _one/_other. */
export function tn(baseKey, n, params = {}) {
  const suffix = n === 1 ? "_one" : "_other";
  return t(baseKey + suffix, { n, ...params });
}

/**
 * Kategorie-Anzeige übersetzen. WICHTIG: Der GESPEICHERTE Wert bleibt IMMER der
 * kanonische deutsche Enum-String (Schema-Validierung + sprachübergreifende
 * Filterung). Übersetzt wird NUR das Label hier. Unbekannt/DE → kanonisch zurück.
 */
export function tCat(canonical) {
  const lang = getLang();
  const m = CAT_DICT[lang];
  return (m && m[canonical]) || canonical;
}

/** Küche-Wert (free-form, canonical DE) → Anzeigesprache. Unbekannt → canonical. */
export function tCuisine(canonical) {
  const lang = getLang();
  const m = CUISINE_DICT[lang];
  return (m && m[canonical]) || canonical;
}

/** Saison-Wert (canonical DE) → Anzeigesprache. Unbekannt → canonical. */
export function tSeason(canonical) {
  const lang = getLang();
  const m = SEASON_DICT[lang];
  return (m && m[canonical]) || canonical;
}

/**
 * Übersetzt den gespeicherten deutschen Datums-String (z.B. "Mai 2026") in die
 * Anzeigesprache. Der Wert in Drive bleibt IMMER Deutsch (kanonisch). Unbekannt
 * oder nicht parsebar → unverändert.
 */
export function tLastCooked(v) {
  if (!v) return v;
  const lang = getLang();
  if (lang === "de") return v;
  const months = MONTH_DICT[lang];
  if (!months) return v;
  for (let i = 0; i < DE_MONTHS.length; i++) {
    if (v.includes(DE_MONTHS[i])) return v.replace(DE_MONTHS[i], months[i]);
  }
  return v;
}

/* ============================================================
   WÖRTERBUCH
   ============================================================ */
export const DICT = {
  /* ---------------- DEUTSCH ---------------- */
  de: {
    common: {
      save: "Speichern", saving: "Speichere…", cancel: "Abbrechen", delete: "Löschen",
      edit: "Bearbeiten", close: "Schließen", back: "Zurück", add: "Hinzufügen",
      search: "Suchen…", menu: "Menü", home: "Startseite", preview: "Vorschau", done: "Fertig",
      offline: "Offline", remove: "Entfernen", saved: "✓ Gespeichert!",
    },
    nav: {
      cookbook: "Rezepte", match: "Koch-Match (Swipe)", shopping: "Einkaufsliste",
      planner: "Wochenplan", assistant: "KI-Assistent", capture: "Rezept erfassen (Foto/URL)",
      lager: "Lager", settings: "Einstellungen", export: "Rezepte als Markdown exportieren",
      driveConnect: "Mit Google Drive verbinden", driveConnected: "Google Drive verbunden",
      driveSyncActive: "✓ Sync aktiv",
    },
    cookbook: {
      title: "Mein Kochbuch", count_one: "{n} Rezept", count_other: "{n} Rezepte",
      toggleFav: "Favorit umschalten",
      searchPlaceholder: "Suchen nach Name oder Zutat…",
      cuisineAll: "Küche: alle", seasonAll: "Saison: alle",
      emptyFav: "Noch keine Favoriten.<br>Öffne ein Rezept und tippe auf ♥.",
      emptyNone: "Keine Rezepte gefunden.<br>Filter anpassen oder mit + ein neues anlegen.",
      newRecipe: "Neues Rezept",
      moreFilters: "Mehr Filter", cuisineLabel: "Küche", seasonLabel: "Saison",
      filterAnd: "UND", filterOr: "ODER",
      filterModeHint: "UND = alle Filter · ODER = irgendeiner",
      clearFilters: "Filter zurücksetzen",
      matchCount_one: "{n} Treffer", matchCount_other: "{n} Treffer",
    },
    chip: {
      all: "Alle", fav: "♥ Favoriten", alltag: "⚡ Alltag", besonders: "✨ Besonders",
      mealprep: "🍱 Meal-Prep", totry: "🆕 Probieren", quick: "⏱ ≤ 30 Min",
    },
    badge: { alltag: "⚡ Alltag", besonders: "✨ Besonders", mealprep: "🍱 Meal-Prep", totry: "🆕 Zu probieren" },
    detail: {
      ingredients: "Zutaten", steps: "Zubereitung", tips: "Tipps",
      toShopping: "🛒 Zutaten zur Einkaufsliste", cookMode: "👨‍🍳 Kochmodus",
      cookedToday: "✓ Heute gekocht", cookedDone: "✓ Eingetragen!",
      addPhoto: "📷 Foto aufnehmen oder hochladen",
      photoFail: "Foto fehlgeschlagen: {msg}",
      noteTitle: "💬 Notiz für Claude",
      notePlaceholder: "Was hat gefehlt oder wie war’s? z.B. „zu wenig Schärfe“, „brauchte 10 Min länger“ …",
      noteSave: "Notiz speichern",
      noteHint: "Beim nächsten Claude-Lauf wird dein Rezept anhand dieser Notiz angepasst und die Notiz danach geleert.",
      backToList: "← Zurück zur Übersicht", lastCooked: "Zuletzt gekocht: {v}",
      timesCooked: "{n}× gekocht", servings: "🍽 {v}",
      confirmDelete: "Rezept wirklich löschen?", confirmPhotoDelete: "Foto löschen?",
      photoNeedsLogin: "Für eigene Fotos bitte zuerst mit Google anmelden (Fotos werden in deinem Drive gespeichert).",
      addedToShopping: "{n} Artikel zur Einkaufsliste hinzugefügt", inStockSkipped: " ({n} im Vorrat übersprungen)",
      switchToList: "Zur Liste wechseln?", nothingToAdd: "Keine Zutaten zum Übernehmen.",
      allInStock: "Alles schon im Vorrat — nichts zu kaufen.",
      tippTopping: "🧀 Topping", tippVariation: "🔄 Variation", tippUpgrade: "✨ Alltags-Upgrade", tippTechnik: "🧑‍🍳 Technik",
    },
    form: {
      newRecipe: "Neues Rezept", editRecipe: "Rezept bearbeiten", reviewDraft: "Rezept-Entwurf prüfen",
      name: "Name", namePlaceholder: "z.B. Linsensuppe", category: "Kategorie",
      time: "Zeit", servings: "Portionen", effort: "Aufwand", difficulty: "Schwierigkeit",
      cuisine: "Küche", cuisinePlaceholder: "z.B. Italienisch", season: "Saison", seasonPlaceholder: "optional",
      mealprep: "🍱 Meal-Prep (hält ~4 Tage)", totry: "🆕 Zu probieren (noch nie gekocht)",
      imageUrl: "Bild-URL (optional)", ingredients: "Zutaten", steps: "Zubereitung",
      tips: "Tipps (optional)", tipsPlaceholder: "Konvention: Topping: … Swap: … Alltags-Upgrade: …",
      ingPlaceholder: "z.B. 2 Eier", stepPlaceholder: "Schritt beschreiben…", addRow: "+ Zeile hinzufügen",
      nameMissing: "Name fehlt", saveFailed: "Speichern fehlgeschlagen: {e}",
      effortNone: "—", effortAlltag: "⚡ Alltag", effortBesonders: "✨ Besonders",
    },
    cooking: {
      title: "Kochmodus", overview: "Übersicht", pager: "Schritt für Schritt",
      portions: "Portionen", portion_one: "{n} Portion", portion_other: "{n} Portionen",
      amountsAdjusted: "Mengen angepasst", ingredients: "Zutaten", tips: "Tipps", steps: "Zubereitung",
      step: "Schritt {a} / {b}", check: "Abhaken", checked: "✓ erledigt", finish: "Fertig — zurück",
      screenOn: "📱 Bildschirm bleibt an. Fortschritt wird gemerkt.", reset: "zurücksetzen",
      resetConfirm: "Abgehakten Fortschritt zurücksetzen?", timerPrompt: "Countdown – wie viele Minuten?",
      timerDone: "✓ fertig!", countdown: "⏱ Countdown",
    },
    match: {
      title: "Koch-Match", subtitle: "Swipe dich durch deine Rezepte",
      hint: "Nach rechts wischen = Match · nach links = weiter",
      done: "Alles durchgeswipt! 🎉", matchCount_one: "{n} Match in deinem Stapel.", matchCount_other: "{n} Matches in deinem Stapel.",
      viewMatches: "🔥 Matches ansehen", restart: "↻ Nochmal von vorn",
      yourMatches: "🔥 Deine Matches ({n})", noMatches: "Noch keine Matches.<br>Swipe Rezepte nach rechts.",
      weekday: "Wochentags", weekend: "Wochenende", ingredientsN: "🥗 {n} Zutaten",
      stampLike: "Lecker", stampNope: "Nö",
    },
    shopping: {
      title: "Einkaufsliste", searchPlaceholder: "Artikel suchen…", customPlaceholder: "Eigenes hinzufügen…",
      less: "Weniger", more: "Mehr",
      addBtn: "+ Hinzufügen", myList: "Meine Liste", clearDone: "Erledigte entfernen",
      clearAll: "Alles löschen", cleared: "Liste geleert.", undo: "Rückgängig",
      sortAisle: "🛒 Supermarkt", sortAlpha: "🔤 A–Z",
      empty: "leer", open: "{n} offen", openDone: "{n} offen · {d} erledigt",
      emptyList: "Liste ist leer.<br>Tippe unten auf Artikel, füge oben eigene hinzu —<br>oder erzeuge sie aus dem <a href=\"#/planner\">Wochenplan</a>.",
      addHeading: "Hinzufügen", results: "Suchergebnisse", nothingFound: "Nichts gefunden.<br>Nutze „Eigenes hinzufügen“ oben.",
      share: "📤 Teilen", shareTitle: "🛒 Einkaufsliste", copied: "✓ Kopiert",
      refreshBtn: "🔄 Aktualisieren", refresh: "Einkaufsliste aktualisieren",
      linkPartner: "Partner verknüpfen", unlinkPartner: "Partner trennen",
      syncStatus: "Synchronisiert ✓", syncPending: "Sync ausstehend",
      pickerPrompt: "Wähle die geteilte Einkaufsliste aus Google Drive",
    },
    planner: {
      title: "Wochenplan", subtitle: "Abendessen, deterministisch geplant",
      newWeek: "♻ Neue Woche", makeShopping: "🛒 Einkaufsliste erstellen", aiWish: "✨ KI-Wunsch",
      leftovers: "🍱 Reste-Tage", noPlan: "Noch kein Wochenplan.<br>Tippe oben auf „♻ Neue Woche“.",
      noRecipe: "— kein Rezept —", leftoverOf: "🍱 Reste von {d}",
      lock: "Tag sperren", unlock: "Entsperren", reroll: "Neu würfeln", pick: "Aus Kochbuch wählen",
      pickFor: "Rezept für {d} wählen", needPlan: "Erst einen Wochenplan erzeugen.",
      aiWishPrompt: "Wie soll ich den Plan anpassen? (z.B. „leichter“, „mehr Middle Eastern“, „nutze meine Kichererbsen“)",
      aiThinking: "✨ Denke…", aiBad: "Die KI-Antwort war nicht verwertbar — Plan unverändert.",
      aiFailed: "KI-Anpassung fehlgeschlagen: {e}",
    },
    assistant: {
      title: "KI-Assistent", premiumSub: "Premium — eigener API-Schlüssel",
      lockedTitle: "KI ist noch nicht freigeschaltet",
      lockedBody: "Der Assistent nutzt deinen <strong>eigenen Anthropic-API-Schlüssel</strong> (BYOK). Er bleibt nur auf diesem Gerät und wird ausschließlich direkt an die Anthropic-API gesendet — nie an Drive, nie an Dritte.<br><br>Alles andere — Kochbuch, Kochmodus, Wochenplan, Einkaufsliste — funktioniert komplett ohne Schlüssel.",
      goSettings: "⚙️ Schlüssel in den Einstellungen hinterlegen",
      toolSuggest: "🍽 Was koche ich heute?", toolFromStock: "🥕 Aus Vorrat kochen", toolLeftover: "🧺 Reste verwerten", toolGenerate: "✨ Rezept erfinden",
      offlineTitle: "Gerade offline", offlineBody: "Der KI-Assistent braucht eine Internetverbindung. Dein Kochbuch, Kochmodus, Wochenplan und die Einkaufsliste laufen offline weiter.", retry: "🔄 Erneut versuchen",
      inputPlaceholder: "Frag mich was — z.B. „schnelles Abendessen mit Feta“",
      empty: "Wähle oben ein Werkzeug oder frag frei heraus.<br>Antworten kommen auf Deutsch — und Rezepte direkt ins Kochbuch.",
      thinking: "🤔 Denke nach…", newIdea: "🆕 neue Idee", openInCookbook: "📖 Im Kochbuch öffnen",
      elaborate: "✨ Rezept ausarbeiten", saveToCookbook: "💾 Ins Kochbuch speichern", lookFirst: "👀 Erst ansehen",
      leftoverPrompt: "Welche Zutaten hast du übrig? (z.B. „½ Zucchini, Feta, 200g Kichererbsen“)",
      generatePrompt: "Was für ein Rezept soll ich erfinden? (z.B. „Bazaar-Bowl mit Granatapfel“)",
      toSettings: "Zu den Einstellungen", previewTitle: "{cat} · Vorschau",
      schemaFail: "Das Rezept war leider nicht schema-konform ({errors}). Formuliere den Wunsch nochmal — ich versuche es erneut.",
    },
    capture: {
      title: "Rezept erfassen", subtitle: "Foto oder URL → Kochbuch",
      howHeading: "So funktioniert's",
      howBody: "Ein Foto (Kochbuchseite, Screenshot) oder eine Rezept-URL wird von einem Vision-Modell gelesen und in dein Schema übersetzt — Zutaten mit 🛒-Markern, Schritte, Tipps, Kategorie. <strong>Vor dem Speichern prüfst du immer das Review-Formular</strong> — nichts landet ungeprüft im Kochbuch.",
      photoHeading: "📷 Foto", urlHeading: "🔗 URL", urlPlaceholder: "https://… (Rezeptseite)",
      analyze: "Analysieren", urlAnalyze: "URL analysieren", manualHeading: "✍️ Oder direkt manuell",
      manualBody: "Das Review-Formular geht jederzeit auch ohne Analyse.", manualBtn: "Rezept manuell erfassen",
      analyzing: "Analysiere… (kann ein paar Sekunden dauern)", retake: "Anderes Foto",
      reading: "Lese das Rezept…", building: "Baue das Rezept zusammen…",
      bulkHeading: "📋 Mehrere auf einmal", bulkBody: "Mehrere Rezepte als Text einfügen — oder die KI bittet, dir gleich mehrere Ideen zu liefern. Alles wird vor dem Speichern geprüft.",
      bulkPlaceholder: "Rezepte hier einfügen … oder einen Wunsch für „KI-Ideen“ eintippen (z.B. „schnelle vegetarische Pasta-Gerichte“).",
      bulkFromText: "Aus Text auslesen", bulkGenerate: "✨ KI-Ideen",
      bulkReview: "{n} Rezept(e) erkannt — auswählen und speichern:", bulkEdit: "Bearbeiten",
      bulkSave: "Ausgewählte speichern", bulkNeedsText: "Bitte zuerst Text einfügen (oder „KI-Ideen“ nutzen).",
      bulkNonePicked: "Nichts ausgewählt.", bulkSaved: "✓ {n} Rezept(e) gespeichert.",
      lockedNote: "🔒 braucht deinen API-Schlüssel", keyOk: "🔑 API-Schlüssel vorhanden", offlineNote: "Offline — KI-Erfassung (Foto/URL) braucht Internet. Der manuelle Weg geht immer.",
      enterUrl: "Bitte zuerst eine URL eingeben.", parseFailed: "Analyse fehlgeschlagen: {e}",
      gotRecipe: "Rezept erkannt — bitte prüfen und speichern.",
    },
    lager: {
      title: "Lager", subtitle: "Vorrat & Kühlschrank",
      stockHeading: "📦 Dauerhafter Vorrat", stockSub: "Immer-im-Haus — antippen = vorhanden. Diese Artikel überspringt die Einkaufsliste.",
      fridgeHeading: "🧊 Kühlschrank & Frischware", fridgeSub: "Was sich häufig ändert. Manuell pflegen oder per Foto scannen.",
      addCustom: "Eigenen Artikel hinzufügen…", addItem: "Artikel", category: "Kategorie",
      fridgeItemPlaceholder: "z.B. ½ Zucchini", fridgeQtyPlaceholder: "Menge/Notiz", usedUp: "aufgebraucht",
      fridgeEmpty: "Kühlschrank ist leer.<br>Artikel eintippen oder Fotos scannen.",
      scan: "📷 Kühlschrank scannen", scanHint: "1–3 Fotos. Das Vision-Modell erkennt sichtbare Lebensmittel.",
      catalogHeading: "🧺 Aus dem Katalog hinzufügen", catalogHint: "Tippe Artikel an — mit Symbol, wie auf der Einkaufsliste.",
      scanAnalyze: "Fotos analysieren", scanStaging: "Erkannt — prüfen und übernehmen:",
      scanAdd: "Zur Kühlschrankliste hinzufügen", scanLocked: "🔒 Scan braucht deinen API-Schlüssel (Einstellungen).", scanOffline: "Offline — der Foto-Scan braucht Internet. Artikel kannst du weiter von Hand hinzufügen.",
      onStockCount: "{n} vorhanden", scanNone: "Nichts erkannt — versuch ein schärferes Foto.",
      duplicate: "„{n}“ ist schon in der Liste — überschreiben?",
    },
    settings: {
      title: "Einstellungen",
      aiHeading: "🔑 KI (eigener Anthropic-Schlüssel)",
      aiNote: "Bring Your Own Key: Der Schlüssel bleibt <strong>nur auf diesem Gerät</strong> (localStorage), wird nie nach Drive synchronisiert und nur direkt an die Anthropic-API gesendet. Kosten laufen über dein Anthropic-Konto.",
      apiKey: "API-Schlüssel", keySave: "Speichern", keyTest: "Verbindung testen", keyRemove: "Entfernen",
      keyActive: "✓ Schlüssel hinterlegt — KI-Features aktiv.", keyStored: "✓ Gespeichert — KI-Features aktiv.",
      keyRemoved: "Schlüssel entfernt — KI-Features deaktiviert. Alles andere läuft weiter.",
      keyNone: "Kein Schlüssel eingegeben.", keyTesting: "Teste…", keyOk: "✓ Verbindung ok — {m}{vision}.",
      keyVision: " (Vision-fähig)", keyBad: "✗ {e}", keyWeird: "Das sieht nicht wie ein Anthropic-Schlüssel aus (beginnt normalerweise mit sk-ant-). Trotzdem speichern?",
      model: "Modell",
      lagerHeading: "🥫 Vorrat & Kühlschrank", lagerNote: "Vorrat und Frischware verwalten — inkl. Foto-Scan.",
      lagerOpen: "📦 Lager öffnen",
      profileHeading: "👨‍🍳 Koch-Profil (für die KI)",
      profileNote: "Das prägt, was die KI vorschlägt — Diät, Tempo, Ausstattung. Frei editierbar.",
      profileLevel: "Kochlevel", profileDiet: "Ernährung", profileServings: "Portionen",
      profileWeekday: "Wochentags", profileWeekend: "Wochenende", profileShopping: "Einkaufsmöglichkeiten",
      profileEquipment: "Küchenausstattung", profileSpices: "Gewürze im Haus", profileNotes: "Weitere Hinweise (optional)",
      profileSave: "Profil speichern", profileReset: "Auf Standard zurücksetzen",
      profileSaved: "✓ Profil gespeichert.", profileResetDone: "✓ Auf Standard zurückgesetzt.",
      driveHeading: "☁️ Google Drive",
      driveNote: "Optional. Synchronisiert <code>rezepte.json</code> über deine Geräte — die App bleibt auch ohne Drive voll nutzbar (lokal).",
      driveConnect: "Mit Google verbinden", driveSync: "Jetzt synchronisieren", driveDisconnect: "Trennen",
      driveConnected: "☁️ Verbunden · {s}", driveNot: "Nicht verbunden — Daten nur lokal auf diesem Gerät.",
      driveConfirmDisconnect: "Drive trennen? Die Rezepte bleiben lokal erhalten; Sync stoppt.",
      themeHeading: "🎨 Design", themeSystem: "🌗 System folgen", themeLight: "☀️ Hell", themeDark: "🌙 Dunkel",
      langHeading: "🌍 Language / Sprache / Idioma",
      aboutHeading: "ℹ️ App", aboutLine: "Build {b} · {n} Rezepte · Schema v3 · Quelle: {src}",
      guideBtn: "ℹ️ Features & Versionen", srcDrive: "Google Drive", srcLocal: "lokal",
    },
    guide: {
      title: "Features & Versionen", version: "Koch v{v}", updated: "Stand: {d}",
      byokHeading: "🤖 KI-Funktionen (BYOK)",
      byokBody: "Die KI-Features nutzen deinen <strong>eigenen Anthropic-API-Schlüssel</strong>. So geht's:<br>1. Schlüssel auf <a href=\"https://console.anthropic.com\" target=\"_blank\" rel=\"noopener\">console.anthropic.com</a> erstellen.<br>2. In den Einstellungen einfügen — er bleibt nur in deinem Browser (localStorage).<br>3. Schaltet frei: Rezept-Foto-Scan, URL-Import, Kühlschrank-Scan, KI-Vorschläge.<br>Aufrufe gehen direkt vom Browser an Anthropic — nie an einen eigenen Server.",
      changelogHeading: "🆕 Was ist neu",
      feats: {
        cookbookT: "📖 Rezeptbuch", cookbookB: "Stöbern, suchen, nach Kategorie/Küche/Saison filtern, Favoriten & Bewertungen.",
        captureT: "✏️ Rezepte erfassen", captureB: "Manuell, per Foto-Scan (KI) oder URL-Import (KI) — immer mit Prüfung vor dem Speichern.",
        cookingT: "👨‍🍳 Kochmodus", cookingB: "Vollbild, Portions-Rechner, Schritt-Timer, Bildschirm bleibt an.",
        plannerT: "🗓️ Wochenplan", plannerB: "Automatischer Wochenplan: Alltag/Wochenende, Tage sperren, neu würfeln, Reste-Tage.",
        shoppingT: "🛒 Einkaufsliste", shoppingB: "Aus dem Plan erzeugt; Vorrat wird automatisch abgezogen.",
        lagerT: "📦 Lager", lagerB: "Dauer-Vorrat (an/aus) + Kühlschrank-Frischware mit KI-Foto-Scan.",
        aiT: "🤖 KI-Funktionen", aiB: "Brauchen deinen eigenen API-Schlüssel (siehe unten).",
      },
    },
    onboarding: { pick: "Sprache wählen", pickSub: "Language · Idioma" },
    errors: {
      nokey: "Kein API-Schlüssel hinterlegt (Einstellungen → KI).",
      offline: "Offline — KI braucht eine Internetverbindung.",
      auth: "API-Schlüssel ungültig oder widerrufen. Prüfe ihn in den Einstellungen.",
      ratelimit: "Rate-Limit erreicht — kurz warten und nochmal versuchen.",
      overloaded: "Anthropic-API gerade überlastet — gleich nochmal versuchen.",
      captureDisabled: "Die automatische Bild-/URL-Analyse ist noch deaktiviert (kommt mit einem späteren Update).",
    },
  },

  /* ---------------- ENGLISH ---------------- */
  en: {
    common: {
      save: "Save", saving: "Saving…", cancel: "Cancel", delete: "Delete",
      edit: "Edit", close: "Close", back: "Back", add: "Add",
      search: "Search…", menu: "Menu", home: "Home", preview: "Preview", done: "Done",
      offline: "Offline", remove: "Remove", saved: "✓ Saved!",
    },
    nav: {
      cookbook: "Recipes", match: "Cook-Match (Swipe)", shopping: "Shopping list",
      planner: "Meal plan", assistant: "AI assistant", capture: "Capture recipe (photo/URL)",
      lager: "Stock", settings: "Settings", export: "Export recipes as Markdown",
      driveConnect: "Connect Google Drive", driveConnected: "Google Drive connected",
      driveSyncActive: "✓ Sync active",
    },
    cookbook: {
      title: "My Cookbook", count_one: "{n} recipe", count_other: "{n} recipes",
      toggleFav: "Toggle favourite",
      searchPlaceholder: "Search by name or ingredient…",
      cuisineAll: "Cuisine: all", seasonAll: "Season: all",
      emptyFav: "No favorites yet.<br>Open a recipe and tap ♥.",
      emptyNone: "No recipes found.<br>Adjust filters or add one with +.",
      newRecipe: "New recipe",
      moreFilters: "More filters", cuisineLabel: "Cuisine", seasonLabel: "Season",
      filterAnd: "AND", filterOr: "OR",
      filterModeHint: "AND = all filters · OR = any of them",
      clearFilters: "Reset filters",
      matchCount_one: "{n} match", matchCount_other: "{n} matches",
    },
    chip: {
      all: "All", fav: "♥ Favorites", alltag: "⚡ Everyday", besonders: "✨ Special",
      mealprep: "🍱 Meal prep", totry: "🆕 To try", quick: "⏱ ≤ 30 min",
    },
    badge: { alltag: "⚡ Everyday", besonders: "✨ Special", mealprep: "🍱 Meal prep", totry: "🆕 To try" },
    detail: {
      ingredients: "Ingredients", steps: "Method", tips: "Tips",
      toShopping: "🛒 Ingredients to shopping list", cookMode: "👨‍🍳 Cooking mode",
      cookedToday: "✓ Cooked today", cookedDone: "✓ Logged!",
      addPhoto: "📷 Take or upload a photo",
      photoFail: "Photo failed: {msg}",
      noteTitle: "💬 Note for Claude",
      notePlaceholder: "What was missing or how was it? e.g. “needs more spice”, “took 10 min longer” …",
      noteSave: "Save note",
      noteHint: "On the next Claude run your recipe is adjusted from this note and the note is then cleared.",
      backToList: "← Back to overview", lastCooked: "Last cooked: {v}",
      timesCooked: "cooked {n}×", servings: "🍽 {v}",
      confirmDelete: "Really delete this recipe?", confirmPhotoDelete: "Delete photo?",
      photoNeedsLogin: "For your own photos please sign in with Google first (photos are stored in your Drive).",
      addedToShopping: "{n} items added to the shopping list", inStockSkipped: " ({n} already in stock skipped)",
      switchToList: "Switch to the list?", nothingToAdd: "No ingredients to add.",
      allInStock: "All in stock already — nothing to buy.",
      tippTopping: "🧀 Topping", tippVariation: "🔄 Variation", tippUpgrade: "✨ Everyday upgrade", tippTechnik: "🧑‍🍳 Technique",
    },
    form: {
      newRecipe: "New recipe", editRecipe: "Edit recipe", reviewDraft: "Review recipe draft",
      name: "Name", namePlaceholder: "e.g. Lentil soup", category: "Category",
      time: "Time", servings: "Servings", effort: "Effort", difficulty: "Difficulty",
      cuisine: "Cuisine", cuisinePlaceholder: "e.g. Italian", season: "Season", seasonPlaceholder: "optional",
      mealprep: "🍱 Meal prep (keeps ~4 days)", totry: "🆕 To try (never cooked)",
      imageUrl: "Image URL (optional)", ingredients: "Ingredients", steps: "Method",
      tips: "Tips (optional)", tipsPlaceholder: "Convention: Topping: … Swap: … Everyday upgrade: …",
      ingPlaceholder: "e.g. 2 eggs", stepPlaceholder: "Describe step…", addRow: "+ Add row",
      nameMissing: "Name missing", saveFailed: "Save failed: {e}",
      effortNone: "—", effortAlltag: "⚡ Everyday", effortBesonders: "✨ Special",
    },
    cooking: {
      title: "Cooking mode", overview: "Overview", pager: "Step by step",
      portions: "Servings", portion_one: "{n} serving", portion_other: "{n} servings",
      amountsAdjusted: "Amounts adjusted", ingredients: "Ingredients", tips: "Tips", steps: "Method",
      step: "Step {a} / {b}", check: "Check off", checked: "✓ done", finish: "Done — back",
      screenOn: "📱 Screen stays on. Progress is remembered.", reset: "reset",
      resetConfirm: "Reset checked-off progress?", timerPrompt: "Countdown – how many minutes?",
      timerDone: "✓ done!", countdown: "⏱ Countdown",
    },
    match: {
      title: "Cook-Match", subtitle: "Swipe through your recipes",
      hint: "Swipe right = match · swipe left = next",
      done: "All swiped! 🎉", matchCount_one: "{n} match in your stack.", matchCount_other: "{n} matches in your stack.",
      viewMatches: "🔥 View matches", restart: "↻ Start over",
      yourMatches: "🔥 Your matches ({n})", noMatches: "No matches yet.<br>Swipe recipes to the right.",
      weekday: "Weekday", weekend: "Weekend", ingredientsN: "🥗 {n} ingredients",
      stampLike: "Yum", stampNope: "Nope",
    },
    shopping: {
      title: "Shopping list", searchPlaceholder: "Search items…", customPlaceholder: "Add your own…",
      less: "Less", more: "More",
      addBtn: "+ Add", myList: "My list", clearDone: "Remove done",
      clearAll: "Clear all", cleared: "List cleared.", undo: "Undo",
      sortAisle: "🛒 Aisle", sortAlpha: "🔤 A–Z",
      empty: "empty", open: "{n} open", openDone: "{n} open · {d} done",
      emptyList: "List is empty.<br>Tap items below, add your own above —<br>or generate from the <a href=\"#/planner\">meal plan</a>.",
      addHeading: "Add", results: "Search results", nothingFound: "Nothing found.<br>Use “Add your own” above.",
      share: "📤 Share", shareTitle: "🛒 Shopping list", copied: "✓ Copied",
      refreshBtn: "🔄 Refresh", refresh: "Refresh shopping list",
      linkPartner: "Link partner", unlinkPartner: "Unlink partner",
      syncStatus: "Synced ✓", syncPending: "Sync pending",
      pickerPrompt: "Pick the shared shopping list from Google Drive",
    },
    planner: {
      title: "Meal plan", subtitle: "Dinners, planned deterministically",
      newWeek: "♻ New week", makeShopping: "🛒 Create shopping list", aiWish: "✨ AI tweak",
      leftovers: "🍱 Leftover days", noPlan: "No meal plan yet.<br>Tap “♻ New week” above.",
      noRecipe: "— no recipe —", leftoverOf: "🍱 Leftovers of {d}",
      lock: "Lock day", unlock: "Unlock", reroll: "Reroll", pick: "Pick from cookbook",
      pickFor: "Pick a recipe for {d}", needPlan: "Generate a meal plan first.",
      aiWishPrompt: "How should I adjust the plan? (e.g. “lighter”, “more Middle Eastern”, “use my chickpeas”)",
      aiThinking: "✨ Thinking…", aiBad: "The AI response wasn't usable — plan unchanged.",
      aiFailed: "AI tweak failed: {e}",
    },
    assistant: {
      title: "AI assistant", premiumSub: "Premium — your own API key",
      lockedTitle: "AI is not unlocked yet",
      lockedBody: "The assistant uses your <strong>own Anthropic API key</strong> (BYOK). It stays only on this device and is sent only directly to the Anthropic API — never to Drive, never to third parties.<br><br>Everything else — cookbook, cooking mode, meal plan, shopping list — works completely without a key.",
      goSettings: "⚙️ Add your key in Settings",
      toolSuggest: "🍽 What should I cook?", toolFromStock: "🥕 Cook from stock", toolLeftover: "🧺 Use leftovers", toolGenerate: "✨ Invent a recipe",
      offlineTitle: "You’re offline", offlineBody: "The AI assistant needs an internet connection. Your cookbook, cooking mode, meal plan and shopping list keep working offline.", retry: "🔄 Try again",
      inputPlaceholder: "Ask me anything — e.g. “quick dinner with feta”",
      empty: "Pick a tool above or just ask.<br>Answers come in German — and recipes go straight into the cookbook.",
      thinking: "🤔 Thinking…", newIdea: "🆕 new idea", openInCookbook: "📖 Open in cookbook",
      elaborate: "✨ Flesh out recipe", saveToCookbook: "💾 Save to cookbook", lookFirst: "👀 Look first",
      leftoverPrompt: "Which ingredients do you have left? (e.g. “½ zucchini, feta, 200g chickpeas”)",
      generatePrompt: "What recipe should I invent? (e.g. “bazaar bowl with pomegranate”)",
      toSettings: "Go to Settings", previewTitle: "{cat} · preview",
      schemaFail: "Sorry, the recipe wasn't schema-valid ({errors}). Rephrase your request — I'll try again.",
    },
    capture: {
      title: "Capture recipe", subtitle: "Photo or URL → cookbook",
      howHeading: "How it works",
      howBody: "A photo (cookbook page, screenshot) or a recipe URL is read by a vision model and translated into your schema — ingredients with 🛒 markers, steps, tips, category. <strong>You always check the review form before saving</strong> — nothing enters the cookbook unchecked.",
      photoHeading: "📷 Photo", urlHeading: "🔗 URL", urlPlaceholder: "https://… (recipe page)",
      analyze: "Analyze", urlAnalyze: "Analyze URL", manualHeading: "✍️ Or just manually",
      manualBody: "The review form works any time, without analysis.", manualBtn: "Enter recipe manually",
      analyzing: "Analyzing… (may take a few seconds)", retake: "Different photo",
      reading: "Reading the recipe…", building: "Building the recipe…",
      bulkHeading: "📋 Several at once", bulkBody: "Paste several recipes as text — or ask the AI to give you several ideas at once. Everything is reviewed before saving.",
      bulkPlaceholder: "Paste recipes here … or type a wish for “AI ideas” (e.g. “quick vegetarian pasta dishes”).",
      bulkFromText: "Read from text", bulkGenerate: "✨ AI ideas",
      bulkReview: "{n} recipe(s) detected — select and save:", bulkEdit: "Edit",
      bulkSave: "Save selected", bulkNeedsText: "Please paste some text first (or use “AI ideas”).",
      bulkNonePicked: "Nothing selected.", bulkSaved: "✓ Saved {n} recipe(s).",
      lockedNote: "🔒 needs your API key", keyOk: "🔑 API key present", offlineNote: "Offline — AI capture (photo/URL) needs internet. The manual path always works.",
      enterUrl: "Please enter a URL first.", parseFailed: "Analysis failed: {e}",
      gotRecipe: "Recipe detected — please review and save.",
    },
    lager: {
      title: "Stock", subtitle: "Pantry & fridge",
      stockHeading: "📦 Always-on stock", stockSub: "Always-in-the-house — tap = in stock. The shopping list skips these items.",
      fridgeHeading: "🧊 Fridge & fresh", fridgeSub: "What changes often. Maintain manually or scan by photo.",
      addCustom: "Add your own item…", addItem: "Item", category: "Category",
      fridgeItemPlaceholder: "e.g. ½ zucchini", fridgeQtyPlaceholder: "Qty/note", usedUp: "used up",
      fridgeEmpty: "Fridge is empty.<br>Type items or scan photos.",
      scan: "📷 Scan fridge", scanHint: "1–3 photos. The vision model detects visible food.",
      catalogHeading: "🧺 Add from catalog", catalogHint: "Tap items — with icons, just like the shopping list.",
      scanAnalyze: "Analyze photos", scanStaging: "Detected — review and add:",
      scanAdd: "Add to fridge list", scanLocked: "🔒 Scan needs your API key (Settings).", scanOffline: "Offline — the photo scan needs internet. You can still add items by hand.",
      onStockCount: "{n} in stock", scanNone: "Nothing detected — try a sharper photo.",
      duplicate: "“{n}” is already in the list — overwrite?",
    },
    settings: {
      title: "Settings",
      aiHeading: "🔑 AI (your own Anthropic key)",
      aiNote: "Bring Your Own Key: the key stays <strong>only on this device</strong> (localStorage), is never synced to Drive and is sent only directly to the Anthropic API. Costs run through your Anthropic account.",
      apiKey: "API key", keySave: "Save", keyTest: "Test connection", keyRemove: "Remove",
      keyActive: "✓ Key stored — AI features active.", keyStored: "✓ Saved — AI features active.",
      keyRemoved: "Key removed — AI features off. Everything else keeps working.",
      keyNone: "No key entered.", keyTesting: "Testing…", keyOk: "✓ Connection ok — {m}{vision}.",
      keyVision: " (vision-capable)", keyBad: "✗ {e}", keyWeird: "That doesn't look like an Anthropic key (usually starts with sk-ant-). Save anyway?",
      model: "Model",
      lagerHeading: "🥫 Pantry & fridge", lagerNote: "Manage stock and fresh items — incl. photo scan.",
      lagerOpen: "📦 Open Stock",
      profileHeading: "👨‍🍳 Cook profile (for the AI)",
      profileNote: "This shapes what the AI suggests — diet, pace, equipment. Edit freely.",
      profileLevel: "Cooking level", profileDiet: "Diet", profileServings: "Servings",
      profileWeekday: "Weekdays", profileWeekend: "Weekend", profileShopping: "Shopping access",
      profileEquipment: "Kitchen equipment", profileSpices: "Spices on hand", profileNotes: "Extra notes (optional)",
      profileSave: "Save profile", profileReset: "Reset to defaults",
      profileSaved: "✓ Profile saved.", profileResetDone: "✓ Reset to defaults.",
      driveHeading: "☁️ Google Drive",
      driveNote: "Optional. Syncs <code>rezepte.json</code> across your devices — the app stays fully usable without Drive (local).",
      driveConnect: "Connect with Google", driveSync: "Sync now", driveDisconnect: "Disconnect",
      driveConnected: "☁️ Connected · {s}", driveNot: "Not connected — data only local on this device.",
      driveConfirmDisconnect: "Disconnect Drive? Recipes stay local; sync stops.",
      themeHeading: "🎨 Theme", themeSystem: "🌗 Follow system", themeLight: "☀️ Light", themeDark: "🌙 Dark",
      langHeading: "🌍 Language / Sprache / Idioma",
      aboutHeading: "ℹ️ App", aboutLine: "Build {b} · {n} recipes · schema v3 · source: {src}",
      guideBtn: "ℹ️ Features & versions", srcDrive: "Google Drive", srcLocal: "local",
    },
    guide: {
      title: "Features & versions", version: "Koch v{v}", updated: "Updated: {d}",
      byokHeading: "🤖 AI features (BYOK)",
      byokBody: "The AI features use your <strong>own Anthropic API key</strong>. Here's how:<br>1. Create a key at <a href=\"https://console.anthropic.com\" target=\"_blank\" rel=\"noopener\">console.anthropic.com</a>.<br>2. Paste it in Settings — it stays only in your browser (localStorage).<br>3. Unlocks: recipe photo scan, URL import, fridge scan, AI suggestions.<br>Calls go directly from your browser to Anthropic — never to any server of ours.",
      changelogHeading: "🆕 What's new",
      feats: {
        cookbookT: "📖 Cookbook", cookbookB: "Browse, search, filter by category/cuisine/season, favorites & ratings.",
        captureT: "✏️ Capture recipes", captureB: "Manual, photo scan (AI) or URL import (AI) — always reviewed before saving.",
        cookingT: "👨‍🍳 Cooking mode", cookingB: "Full screen, portion scaler, step timers, screen stays on.",
        plannerT: "🗓️ Meal plan", plannerB: "Automatic weekly plan: everyday/weekend, lock days, reroll, leftover days.",
        shoppingT: "🛒 Shopping list", shoppingB: "Generated from the plan; in-stock items subtracted automatically.",
        lagerT: "📦 Stock", lagerB: "Always-on pantry (on/off) + fridge fresh items with AI photo scan.",
        aiT: "🤖 AI features", aiB: "Need your own API key (see below).",
      },
    },
    onboarding: { pick: "Choose language", pickSub: "Sprache · Idioma" },
    errors: {
      nokey: "No API key set (Settings → AI).",
      offline: "Offline — AI needs an internet connection.",
      auth: "API key invalid or revoked. Check it in Settings.",
      ratelimit: "Rate limit reached — wait a moment and retry.",
      overloaded: "Anthropic API overloaded right now — retry shortly.",
      captureDisabled: "Automatic image/URL analysis is still disabled (coming in a later update).",
    },
  },

  /* ---------------- ESPAÑOL ---------------- */
  es: {
    common: {
      save: "Guardar", saving: "Guardando…", cancel: "Cancelar", delete: "Eliminar",
      edit: "Editar", close: "Cerrar", back: "Atrás", add: "Añadir",
      search: "Buscar…", menu: "Menú", home: "Inicio", preview: "Vista previa", done: "Listo",
      offline: "Sin conexión", remove: "Quitar", saved: "✓ ¡Guardado!",
    },
    nav: {
      cookbook: "Recetas", match: "Cook-Match (deslizar)", shopping: "Lista de compra",
      planner: "Plan semanal", assistant: "Asistente IA", capture: "Capturar receta (foto/URL)",
      lager: "Despensa", settings: "Ajustes", export: "Exportar recetas como Markdown",
      driveConnect: "Conectar Google Drive", driveConnected: "Google Drive conectado",
      driveSyncActive: "✓ Sync activo",
    },
    cookbook: {
      title: "Mi recetario", count_one: "{n} receta", count_other: "{n} recetas",
      toggleFav: "Marcar favorito",
      searchPlaceholder: "Buscar por nombre o ingrediente…",
      cuisineAll: "Cocina: todas", seasonAll: "Temporada: todas",
      emptyFav: "Aún no hay favoritos.<br>Abre una receta y toca ♥.",
      emptyNone: "No se encontraron recetas.<br>Ajusta filtros o añade una con +.",
      newRecipe: "Nueva receta",
      moreFilters: "Más filtros", cuisineLabel: "Cocina", seasonLabel: "Temporada",
      filterAnd: "Y", filterOr: "O",
      filterModeHint: "Y = todos los filtros · O = cualquiera",
      clearFilters: "Restablecer filtros",
      matchCount_one: "{n} resultado", matchCount_other: "{n} resultados",
    },
    chip: {
      all: "Todas", fav: "♥ Favoritos", alltag: "⚡ Diario", besonders: "✨ Especial",
      mealprep: "🍱 Meal prep", totry: "🆕 Probar", quick: "⏱ ≤ 30 min",
    },
    badge: { alltag: "⚡ Diario", besonders: "✨ Especial", mealprep: "🍱 Meal prep", totry: "🆕 Probar" },
    detail: {
      ingredients: "Ingredientes", steps: "Preparación", tips: "Consejos",
      toShopping: "🛒 Ingredientes a la lista", cookMode: "👨‍🍳 Modo cocina",
      cookedToday: "✓ Cocinado hoy", cookedDone: "✓ ¡Registrado!",
      addPhoto: "📷 Hacer o subir una foto",
      photoFail: "Error con la foto: {msg}",
      noteTitle: "💬 Nota para Claude",
      notePlaceholder: "¿Qué faltó o qué tal estuvo? p. ej. “más picante”, “tardó 10 min más” …",
      noteSave: "Guardar nota",
      noteHint: "En la próxima ejecución de Claude tu receta se ajusta con esta nota y luego se borra.",
      backToList: "← Volver al resumen", lastCooked: "Cocinado por última vez: {v}",
      timesCooked: "cocinado {n}×", servings: "🍽 {v}",
      confirmDelete: "¿Eliminar esta receta?", confirmPhotoDelete: "¿Eliminar foto?",
      photoNeedsLogin: "Para tus propias fotos inicia sesión con Google primero (se guardan en tu Drive).",
      addedToShopping: "{n} artículos añadidos a la lista", inStockSkipped: " ({n} ya en despensa omitidos)",
      switchToList: "¿Ir a la lista?", nothingToAdd: "No hay ingredientes que añadir.",
      allInStock: "Todo ya en despensa — nada que comprar.",
      tippTopping: "🧀 Topping", tippVariation: "🔄 Variación", tippUpgrade: "✨ Mejora diaria", tippTechnik: "🧑‍🍳 Técnica",
    },
    form: {
      newRecipe: "Nueva receta", editRecipe: "Editar receta", reviewDraft: "Revisar borrador",
      name: "Nombre", namePlaceholder: "p. ej. Sopa de lentejas", category: "Categoría",
      time: "Tiempo", servings: "Raciones", effort: "Esfuerzo", difficulty: "Dificultad",
      cuisine: "Cocina", cuisinePlaceholder: "p. ej. Italiana", season: "Temporada", seasonPlaceholder: "opcional",
      mealprep: "🍱 Meal prep (dura ~4 días)", totry: "🆕 Probar (nunca cocinado)",
      imageUrl: "URL de imagen (opcional)", ingredients: "Ingredientes", steps: "Preparación",
      tips: "Consejos (opcional)", tipsPlaceholder: "Convención: Topping: … Swap: … Mejora diaria: …",
      ingPlaceholder: "p. ej. 2 huevos", stepPlaceholder: "Describe el paso…", addRow: "+ Añadir fila",
      nameMissing: "Falta el nombre", saveFailed: "Error al guardar: {e}",
      effortNone: "—", effortAlltag: "⚡ Diario", effortBesonders: "✨ Especial",
    },
    cooking: {
      title: "Modo cocina", overview: "Resumen", pager: "Paso a paso",
      portions: "Raciones", portion_one: "{n} ración", portion_other: "{n} raciones",
      amountsAdjusted: "Cantidades ajustadas", ingredients: "Ingredientes", tips: "Consejos", steps: "Preparación",
      step: "Paso {a} / {b}", check: "Marcar", checked: "✓ hecho", finish: "Listo — volver",
      screenOn: "📱 La pantalla queda encendida. Se recuerda el progreso.", reset: "reiniciar",
      resetConfirm: "¿Reiniciar el progreso marcado?", timerPrompt: "Cuenta atrás – ¿cuántos minutos?",
      timerDone: "✓ ¡listo!", countdown: "⏱ Cuenta atrás",
    },
    match: {
      title: "Cook-Match", subtitle: "Desliza por tus recetas",
      hint: "Derecha = match · izquierda = siguiente",
      done: "¡Todo deslizado! 🎉", matchCount_one: "{n} match en tu pila.", matchCount_other: "{n} matches en tu pila.",
      viewMatches: "🔥 Ver matches", restart: "↻ Empezar de nuevo",
      yourMatches: "🔥 Tus matches ({n})", noMatches: "Aún no hay matches.<br>Desliza recetas a la derecha.",
      weekday: "Entre semana", weekend: "Fin de semana", ingredientsN: "🥗 {n} ingredientes",
      stampLike: "Rico", stampNope: "No",
    },
    shopping: {
      title: "Lista de compra", searchPlaceholder: "Buscar artículos…", customPlaceholder: "Añadir propio…",
      less: "Menos", more: "Más",
      addBtn: "+ Añadir", myList: "Mi lista", clearDone: "Quitar hechos",
      clearAll: "Vaciar todo", cleared: "Lista vaciada.", undo: "Deshacer",
      sortAisle: "🛒 Pasillo", sortAlpha: "🔤 A–Z",
      empty: "vacía", open: "{n} pendientes", openDone: "{n} pendientes · {d} hechos",
      emptyList: "La lista está vacía.<br>Toca artículos abajo, añade los tuyos arriba —<br>o genérala desde el <a href=\"#/planner\">plan semanal</a>.",
      addHeading: "Añadir", results: "Resultados", nothingFound: "Nada encontrado.<br>Usa “Añadir propio” arriba.",
      share: "📤 Compartir", shareTitle: "🛒 Lista de compra", copied: "✓ Copiado",
      refreshBtn: "🔄 Actualizar", refresh: "Actualizar lista de compra",
      linkPartner: "Vincular pareja", unlinkPartner: "Desvincular pareja",
      syncStatus: "Sincronizado ✓", syncPending: "Sincronización pendiente",
      pickerPrompt: "Elige la lista de compra compartida de Google Drive",
    },
    planner: {
      title: "Plan semanal", subtitle: "Cenas, planificadas de forma determinista",
      newWeek: "♻ Nueva semana", makeShopping: "🛒 Crear lista de compra", aiWish: "✨ Ajuste IA",
      leftovers: "🍱 Días de sobras", noPlan: "Aún no hay plan.<br>Toca “♻ Nueva semana” arriba.",
      noRecipe: "— sin receta —", leftoverOf: "🍱 Sobras de {d}",
      lock: "Fijar día", unlock: "Desfijar", reroll: "Volver a tirar", pick: "Elegir del recetario",
      pickFor: "Elegir receta para {d}", needPlan: "Genera un plan primero.",
      aiWishPrompt: "¿Cómo ajusto el plan? (p. ej. “más ligero”, “más Middle Eastern”, “usa mis garbanzos”)",
      aiThinking: "✨ Pensando…", aiBad: "La respuesta de la IA no se pudo usar — plan sin cambios.",
      aiFailed: "Ajuste IA fallido: {e}",
    },
    assistant: {
      title: "Asistente IA", premiumSub: "Premium — tu propia clave API",
      lockedTitle: "La IA aún no está desbloqueada",
      lockedBody: "El asistente usa tu <strong>propia clave API de Anthropic</strong> (BYOK). Se queda solo en este dispositivo y se envía únicamente directo a la API de Anthropic — nunca a Drive, nunca a terceros.<br><br>Todo lo demás — recetario, modo cocina, plan, lista — funciona sin clave.",
      goSettings: "⚙️ Añade tu clave en Ajustes",
      toolSuggest: "🍽 ¿Qué cocino hoy?", toolFromStock: "🥕 Cocinar con lo que hay", toolLeftover: "🧺 Usar sobras", toolGenerate: "✨ Inventar receta",
      offlineTitle: "Estás sin conexión", offlineBody: "El asistente de IA necesita conexión a internet. Tu recetario, modo cocina, plan y lista de la compra siguen funcionando sin conexión.", retry: "🔄 Reintentar",
      inputPlaceholder: "Pregúntame algo — p. ej. “cena rápida con feta”",
      empty: "Elige una herramienta arriba o pregunta libremente.<br>Las respuestas llegan en alemán — y las recetas directas al recetario.",
      thinking: "🤔 Pensando…", newIdea: "🆕 nueva idea", openInCookbook: "📖 Abrir en recetario",
      elaborate: "✨ Desarrollar receta", saveToCookbook: "💾 Guardar en recetario", lookFirst: "👀 Ver primero",
      leftoverPrompt: "¿Qué ingredientes te sobran? (p. ej. “½ calabacín, feta, 200g garbanzos”)",
      generatePrompt: "¿Qué receta invento? (p. ej. “bowl de bazaar con granada”)",
      toSettings: "Ir a Ajustes", previewTitle: "{cat} · vista previa",
      schemaFail: "La receta no cumplió el esquema ({errors}). Reformula tu petición y lo intento de nuevo.",
    },
    capture: {
      title: "Capturar receta", subtitle: "Foto o URL → recetario",
      howHeading: "Cómo funciona",
      howBody: "Una foto (página de recetario, captura) o una URL de receta la lee un modelo de visión y la traduce a tu esquema — ingredientes con marcas 🛒, pasos, consejos, categoría. <strong>Siempre revisas el formulario antes de guardar</strong> — nada entra sin revisar.",
      photoHeading: "📷 Foto", urlHeading: "🔗 URL", urlPlaceholder: "https://… (página de receta)",
      analyze: "Analizar", urlAnalyze: "Analizar URL", manualHeading: "✍️ O directamente manual",
      manualBody: "El formulario funciona en cualquier momento, sin análisis.", manualBtn: "Introducir receta manual",
      analyzing: "Analizando… (puede tardar unos segundos)", retake: "Otra foto",
      reading: "Leyendo la receta…", building: "Creando la receta…",
      bulkHeading: "📋 Varias a la vez", bulkBody: "Pega varias recetas como texto — o pide a la IA varias ideas a la vez. Todo se revisa antes de guardar.",
      bulkPlaceholder: "Pega recetas aquí … o escribe un deseo para “Ideas IA” (p.ej. “pastas vegetarianas rápidas”).",
      bulkFromText: "Leer del texto", bulkGenerate: "✨ Ideas IA",
      bulkReview: "{n} receta(s) detectada(s) — selecciona y guarda:", bulkEdit: "Editar",
      bulkSave: "Guardar seleccionadas", bulkNeedsText: "Pega primero algo de texto (o usa “Ideas IA”).",
      bulkNonePicked: "Nada seleccionado.", bulkSaved: "✓ {n} receta(s) guardada(s).",
      lockedNote: "🔒 necesita tu clave API", keyOk: "🔑 clave API presente", offlineNote: "Sin conexión — la captura con IA (foto/URL) necesita internet. La vía manual siempre funciona.",
      enterUrl: "Introduce primero una URL.", parseFailed: "Análisis fallido: {e}",
      gotRecipe: "Receta detectada — revisa y guarda.",
    },
    lager: {
      title: "Despensa", subtitle: "Despensa y nevera",
      stockHeading: "📦 Stock permanente", stockSub: "Siempre-en-casa — toca = disponible. La lista de compra omite estos.",
      fridgeHeading: "🧊 Nevera y fresco", fridgeSub: "Lo que cambia a menudo. Gestiona a mano o escanea por foto.",
      addCustom: "Añadir artículo propio…", addItem: "Artículo", category: "Categoría",
      fridgeItemPlaceholder: "p. ej. ½ calabacín", fridgeQtyPlaceholder: "Cant./nota", usedUp: "agotado",
      fridgeEmpty: "La nevera está vacía.<br>Escribe artículos o escanea fotos.",
      scan: "📷 Escanear nevera", scanHint: "1–3 fotos. El modelo de visión detecta alimentos visibles.",
      catalogHeading: "🧺 Añadir del catálogo", catalogHint: "Toca artículos — con icono, como en la lista de compra.",
      scanAnalyze: "Analizar fotos", scanStaging: "Detectado — revisa y añade:",
      scanAdd: "Añadir a la nevera", scanLocked: "🔒 Escaneo necesita tu clave API (Ajustes).", scanOffline: "Sin conexión — el escaneo por foto necesita internet. Puedes seguir añadiendo a mano.",
      onStockCount: "{n} disponibles", scanNone: "Nada detectado — prueba una foto más nítida.",
      duplicate: "“{n}” ya está en la lista — ¿sobrescribir?",
    },
    settings: {
      title: "Ajustes",
      aiHeading: "🔑 IA (tu propia clave Anthropic)",
      aiNote: "Bring Your Own Key: la clave se queda <strong>solo en este dispositivo</strong> (localStorage), nunca se sincroniza a Drive y se envía solo directo a la API de Anthropic. Los costes corren por tu cuenta de Anthropic.",
      apiKey: "Clave API", keySave: "Guardar", keyTest: "Probar conexión", keyRemove: "Quitar",
      keyActive: "✓ Clave guardada — IA activa.", keyStored: "✓ Guardada — IA activa.",
      keyRemoved: "Clave quitada — IA desactivada. El resto sigue funcionando.",
      keyNone: "No se introdujo clave.", keyTesting: "Probando…", keyOk: "✓ Conexión ok — {m}{vision}.",
      keyVision: " (con visión)", keyBad: "✗ {e}", keyWeird: "No parece una clave de Anthropic (suele empezar por sk-ant-). ¿Guardar igual?",
      model: "Modelo",
      lagerHeading: "🥫 Despensa y nevera", lagerNote: "Gestiona stock y fresco — incl. escaneo por foto.",
      lagerOpen: "📦 Abrir Despensa",
      profileHeading: "👨‍🍳 Perfil de cocina (para la IA)",
      profileNote: "Esto moldea lo que sugiere la IA — dieta, ritmo, equipamiento. Editable libremente.",
      profileLevel: "Nivel de cocina", profileDiet: "Dieta", profileServings: "Raciones",
      profileWeekday: "Entre semana", profileWeekend: "Fin de semana", profileShopping: "Dónde compras",
      profileEquipment: "Equipamiento", profileSpices: "Especias en casa", profileNotes: "Notas extra (opcional)",
      profileSave: "Guardar perfil", profileReset: "Restablecer valores",
      profileSaved: "✓ Perfil guardado.", profileResetDone: "✓ Restablecido.",
      driveHeading: "☁️ Google Drive",
      driveNote: "Opcional. Sincroniza <code>rezepte.json</code> entre dispositivos — la app sigue usable sin Drive (local).",
      driveConnect: "Conectar con Google", driveSync: "Sincronizar ahora", driveDisconnect: "Desconectar",
      driveConnected: "☁️ Conectado · {s}", driveNot: "Sin conectar — datos solo locales en este dispositivo.",
      driveConfirmDisconnect: "¿Desconectar Drive? Las recetas quedan locales; el sync se detiene.",
      themeHeading: "🎨 Tema", themeSystem: "🌗 Seguir sistema", themeLight: "☀️ Claro", themeDark: "🌙 Oscuro",
      langHeading: "🌍 Language / Sprache / Idioma",
      aboutHeading: "ℹ️ App", aboutLine: "Build {b} · {n} recetas · esquema v3 · fuente: {src}",
      guideBtn: "ℹ️ Funciones y versiones", srcDrive: "Google Drive", srcLocal: "local",
    },
    guide: {
      title: "Funciones y versiones", version: "Koch v{v}", updated: "Actualizado: {d}",
      byokHeading: "🤖 Funciones IA (BYOK)",
      byokBody: "Las funciones IA usan tu <strong>propia clave API de Anthropic</strong>. Así:<br>1. Crea una clave en <a href=\"https://console.anthropic.com\" target=\"_blank\" rel=\"noopener\">console.anthropic.com</a>.<br>2. Pégala en Ajustes — se queda solo en tu navegador (localStorage).<br>3. Desbloquea: escaneo de foto, importar URL, escaneo de nevera, sugerencias IA.<br>Las llamadas van directas de tu navegador a Anthropic — nunca a un servidor nuestro.",
      changelogHeading: "🆕 Novedades",
      feats: {
        cookbookT: "📖 Recetario", cookbookB: "Explora, busca, filtra por categoría/cocina/temporada, favoritos y valoraciones.",
        captureT: "✏️ Capturar recetas", captureB: "Manual, escaneo de foto (IA) o importar URL (IA) — siempre con revisión antes de guardar.",
        cookingT: "👨‍🍳 Modo cocina", cookingB: "Pantalla completa, calculadora de raciones, temporizadores, pantalla encendida.",
        plannerT: "🗓️ Plan semanal", plannerB: "Plan automático: diario/fin de semana, fijar días, volver a tirar, días de sobras.",
        shoppingT: "🛒 Lista de compra", shoppingB: "Generada del plan; lo que hay en stock se descuenta automáticamente.",
        lagerT: "📦 Despensa", lagerB: "Stock permanente (on/off) + nevera fresca con escaneo IA.",
        aiT: "🤖 Funciones IA", aiB: "Necesitan tu propia clave API (ver abajo).",
      },
    },
    onboarding: { pick: "Elige idioma", pickSub: "Language · Sprache" },
    errors: {
      nokey: "Sin clave API (Ajustes → IA).",
      offline: "Sin conexión — la IA necesita internet.",
      auth: "Clave API inválida o revocada. Revísala en Ajustes.",
      ratelimit: "Límite de uso alcanzado — espera y reintenta.",
      overloaded: "API de Anthropic sobrecargada — reintenta en breve.",
      captureDisabled: "El análisis automático de imagen/URL aún está desactivado (llegará en una actualización).",
    },
  },

  /* ---------------- DANSK ---------------- */
  da: {
    common: {
      save: "Gem", saving: "Gemmer…", cancel: "Annuller", delete: "Slet",
      edit: "Rediger", close: "Luk", back: "Tilbage", add: "Tilføj",
      search: "Søg…", menu: "Menu", home: "Forside", preview: "Forhåndsvisning", done: "Færdig",
      offline: "Offline", remove: "Fjern", saved: "✓ Gemt!",
    },
    nav: {
      cookbook: "Opskrifter", match: "Kok-Match (swipe)", shopping: "Indkøbsliste",
      planner: "Madplan", assistant: "AI-assistent", capture: "Tilføj opskrift (foto/URL)",
      lager: "Lager", settings: "Indstillinger", export: "Eksportér opskrifter som Markdown",
      driveConnect: "Forbind Google Drive", driveConnected: "Google Drive forbundet",
      driveSyncActive: "✓ Sync aktiv",
    },
    cookbook: {
      title: "Min kogebog", count_one: "{n} opskrift", count_other: "{n} opskrifter",
      toggleFav: "Skift favorit",
      searchPlaceholder: "Søg efter navn eller ingrediens…",
      cuisineAll: "Køkken: alle", seasonAll: "Sæson: alle",
      emptyFav: "Ingen favoritter endnu.<br>Åbn en opskrift og tryk på ♥.",
      emptyNone: "Ingen opskrifter fundet.<br>Justér filtre eller tilføj en med +.",
      newRecipe: "Ny opskrift",
      moreFilters: "Flere filtre", cuisineLabel: "Køkken", seasonLabel: "Sæson",
      filterAnd: "OG", filterOr: "ELLER",
      filterModeHint: "OG = alle filtre · ELLER = et af dem",
      clearFilters: "Nulstil filtre",
      matchCount_one: "{n} resultat", matchCount_other: "{n} resultater",
    },
    chip: {
      all: "Alle", fav: "♥ Favoritter", alltag: "⚡ Hverdag", besonders: "✨ Særlig",
      mealprep: "🍱 Meal prep", totry: "🆕 Prøv", quick: "⏱ ≤ 30 min",
    },
    badge: { alltag: "⚡ Hverdag", besonders: "✨ Særlig", mealprep: "🍱 Meal prep", totry: "🆕 Prøv" },
    detail: {
      ingredients: "Ingredienser", steps: "Fremgangsmåde", tips: "Tips",
      toShopping: "🛒 Ingredienser til indkøbsliste", cookMode: "👨‍🍳 Kogetilstand",
      cookedToday: "✓ Lavet i dag", cookedDone: "✓ Registreret!",
      addPhoto: "📷 Tag eller upload et foto",
      photoFail: "Foto mislykkedes: {msg}",
      noteTitle: "💬 Note til Claude",
      notePlaceholder: "Hvad manglede, eller hvordan var det? f.eks. „mere krydderi“, „tog 10 min længere“ …",
      noteSave: "Gem note",
      noteHint: "Ved næste Claude-kørsel justeres din opskrift ud fra denne note, og noten ryddes derefter.",
      backToList: "← Tilbage til oversigt", lastCooked: "Sidst lavet: {v}",
      timesCooked: "lavet {n}×", servings: "🍽 {v}",
      confirmDelete: "Vil du slette denne opskrift?", confirmPhotoDelete: "Slet foto?",
      photoNeedsLogin: "For egne fotos log venligst ind med Google først (fotos gemmes i dit Drive).",
      addedToShopping: "{n} varer tilføjet til indkøbslisten", inStockSkipped: " ({n} allerede på lager sprunget over)",
      switchToList: "Skift til listen?", nothingToAdd: "Ingen ingredienser at tilføje.",
      allInStock: "Alt er allerede på lager — intet at købe.",
      tippTopping: "🧀 Topping", tippVariation: "🔄 Variation", tippUpgrade: "✨ Hverdags-upgrade", tippTechnik: "🧑‍🍳 Teknik",
    },
    form: {
      newRecipe: "Ny opskrift", editRecipe: "Rediger opskrift", reviewDraft: "Tjek opskriftsudkast",
      name: "Navn", namePlaceholder: "f.eks. Linsesuppe", category: "Kategori",
      time: "Tid", servings: "Portioner", effort: "Indsats", difficulty: "Sværhedsgrad",
      cuisine: "Køkken", cuisinePlaceholder: "f.eks. Italiensk", season: "Sæson", seasonPlaceholder: "valgfrit",
      mealprep: "🍱 Meal prep (holder ~4 dage)", totry: "🆕 Prøv (aldrig lavet)",
      imageUrl: "Billede-URL (valgfrit)", ingredients: "Ingredienser", steps: "Fremgangsmåde",
      tips: "Tips (valgfrit)", tipsPlaceholder: "Konvention: Topping: … Swap: … Hverdags-upgrade: …",
      ingPlaceholder: "f.eks. 2 æg", stepPlaceholder: "Beskriv trin…", addRow: "+ Tilføj række",
      nameMissing: "Navn mangler", saveFailed: "Gem mislykkedes: {e}",
      effortNone: "—", effortAlltag: "⚡ Hverdag", effortBesonders: "✨ Særlig",
    },
    cooking: {
      title: "Kogetilstand", overview: "Oversigt", pager: "Trin for trin",
      portions: "Portioner", portion_one: "{n} portion", portion_other: "{n} portioner",
      amountsAdjusted: "Mængder justeret", ingredients: "Ingredienser", tips: "Tips", steps: "Fremgangsmåde",
      step: "Trin {a} / {b}", check: "Afkryds", checked: "✓ færdig", finish: "Færdig — tilbage",
      screenOn: "📱 Skærmen forbliver tændt. Fremskridt huskes.", reset: "nulstil",
      resetConfirm: "Nulstil afkrydset fremskridt?", timerPrompt: "Nedtælling – hvor mange minutter?",
      timerDone: "✓ færdig!", countdown: "⏱ Nedtælling",
    },
    match: {
      title: "Kok-Match", subtitle: "Swipe gennem dine opskrifter",
      hint: "Swipe højre = match · swipe venstre = næste",
      done: "Alt swipet! 🎉", matchCount_one: "{n} match i din bunke.", matchCount_other: "{n} matches i din bunke.",
      viewMatches: "🔥 Se matches", restart: "↻ Start forfra",
      yourMatches: "🔥 Dine matches ({n})", noMatches: "Ingen matches endnu.<br>Swipe opskrifter til højre.",
      weekday: "Hverdag", weekend: "Weekend", ingredientsN: "🥗 {n} ingredienser",
      stampLike: "Lækkert", stampNope: "Nej",
    },
    shopping: {
      title: "Indkøbsliste", searchPlaceholder: "Søg varer…", customPlaceholder: "Tilføj egen…",
      less: "Mindre", more: "Mere",
      addBtn: "+ Tilføj", myList: "Min liste", clearDone: "Fjern færdige",
      clearAll: "Ryd alt", cleared: "Liste ryddet.", undo: "Fortryd",
      sortAisle: "🛒 Supermarked", sortAlpha: "🔤 A–Å",
      empty: "tom", open: "{n} åbne", openDone: "{n} åbne · {d} færdige",
      emptyList: "Listen er tom.<br>Tryk på varer nedenfor, tilføj egne ovenfor —<br>eller generér fra <a href=\"#/planner\">madplanen</a>.",
      addHeading: "Tilføj", results: "Søgeresultater", nothingFound: "Intet fundet.<br>Brug „Tilføj egen“ ovenfor.",
      share: "📤 Del", shareTitle: "🛒 Indkøbsliste", copied: "✓ Kopieret",
      refreshBtn: "🔄 Opdater", refresh: "Opdater indkøbsliste",
      linkPartner: "Tilknyt partner", unlinkPartner: "Fjern partner",
      syncStatus: "Synkroniseret ✓", syncPending: "Synkronisering afventer",
      pickerPrompt: "Vælg den delte indkøbsliste fra Google Drive",
    },
    planner: {
      title: "Madplan", subtitle: "Aftensmad, planlagt deterministisk",
      newWeek: "♻ Ny uge", makeShopping: "🛒 Opret indkøbsliste", aiWish: "✨ AI-ønske",
      leftovers: "🍱 Rester-dage", noPlan: "Ingen madplan endnu.<br>Tryk på „♻ Ny uge“ ovenfor.",
      noRecipe: "— ingen opskrift —", leftoverOf: "🍱 Rester fra {d}",
      lock: "Lås dag", unlock: "Lås op", reroll: "Slå om", pick: "Vælg fra kogebog",
      pickFor: "Vælg opskrift til {d}", needPlan: "Lav en madplan først.",
      aiWishPrompt: "Hvordan skal jeg justere planen? (f.eks. „lettere“, „mere Middle Eastern“, „brug mine kikærter“)",
      aiThinking: "✨ Tænker…", aiBad: "AI-svaret kunne ikke bruges — plan uændret.",
      aiFailed: "AI-justering mislykkedes: {e}",
    },
    assistant: {
      title: "AI-assistent", premiumSub: "Premium — egen API-nøgle",
      lockedTitle: "AI er ikke låst op endnu",
      lockedBody: "Assistenten bruger din <strong>egen Anthropic-API-nøgle</strong> (BYOK). Den bliver kun på denne enhed og sendes kun direkte til Anthropic-API’en — aldrig til Drive, aldrig til tredjeparter.<br><br>Alt andet — kogebog, kogetilstand, madplan, indkøbsliste — virker helt uden nøgle.",
      goSettings: "⚙️ Tilføj din nøgle i Indstillinger",
      toolSuggest: "🍽 Hvad skal jeg lave?", toolFromStock: "🥕 Lav mad fra lager", toolLeftover: "🧺 Brug rester", toolGenerate: "✨ Find på en opskrift",
      offlineTitle: "Du er offline", offlineBody: "AI-assistenten kræver en internetforbindelse. Din kogebog, kogetilstand, madplan og indkøbsliste virker fortsat offline.", retry: "🔄 Prøv igen",
      inputPlaceholder: "Spørg mig om noget — f.eks. „hurtig aftensmad med feta“",
      empty: "Vælg et værktøj ovenfor eller spørg frit.<br>Svar kommer på dansk — og opskrifter direkte i kogebogen.",
      thinking: "🤔 Tænker…", newIdea: "🆕 ny idé", openInCookbook: "📖 Åbn i kogebog",
      elaborate: "✨ Uddyb opskrift", saveToCookbook: "💾 Gem i kogebog", lookFirst: "👀 Se først",
      leftoverPrompt: "Hvilke ingredienser har du tilovers? (f.eks. „½ squash, feta, 200g kikærter“)",
      generatePrompt: "Hvilken opskrift skal jeg finde på? (f.eks. „bazaar-bowl med granatæble“)",
      toSettings: "Til Indstillinger", previewTitle: "{cat} · forhåndsvisning",
      schemaFail: "Opskriften var desværre ikke skema-gyldig ({errors}). Omformuler dit ønske — jeg prøver igen.",
    },
    capture: {
      title: "Tilføj opskrift", subtitle: "Foto eller URL → kogebog",
      howHeading: "Sådan virker det",
      howBody: "Et foto (kogebogsside, screenshot) eller en opskrifts-URL læses af en vision-model og oversættes til dit skema — ingredienser med 🛒-markører, trin, tips, kategori. <strong>Du tjekker altid review-formularen før du gemmer</strong> — intet havner i kogebogen utjekket.",
      photoHeading: "📷 Foto", urlHeading: "🔗 URL", urlPlaceholder: "https://… (opskriftsside)",
      analyze: "Analysér", urlAnalyze: "Analysér URL", manualHeading: "✍️ Eller direkte manuelt",
      manualBody: "Review-formularen virker når som helst, uden analyse.", manualBtn: "Tilføj opskrift manuelt",
      analyzing: "Analyserer… (kan tage et par sekunder)", retake: "Andet foto",
      reading: "Læser opskriften…", building: "Bygger opskriften…",
      bulkHeading: "📋 Flere på én gang", bulkBody: "Indsæt flere opskrifter som tekst — eller bed AI’en om at give dig flere idéer på én gang. Alt tjekkes før du gemmer.",
      bulkPlaceholder: "Indsæt opskrifter her … eller skriv et ønske til „AI-idéer“ (f.eks. „hurtige vegetariske pastaretter“).",
      bulkFromText: "Læs fra tekst", bulkGenerate: "✨ AI-idéer",
      bulkReview: "{n} opskrift(er) fundet — vælg og gem:", bulkEdit: "Rediger",
      bulkSave: "Gem valgte", bulkNeedsText: "Indsæt venligst noget tekst først (eller brug „AI-idéer“).",
      bulkNonePicked: "Intet valgt.", bulkSaved: "✓ {n} opskrift(er) gemt.",
      lockedNote: "🔒 kræver din API-nøgle", keyOk: "🔑 API-nøgle til stede", offlineNote: "Offline — AI-registrering (foto/URL) kræver internet. Den manuelle vej virker altid.",
      enterUrl: "Indtast venligst en URL først.", parseFailed: "Analyse mislykkedes: {e}",
      gotRecipe: "Opskrift fundet — tjek og gem.",
    },
    lager: {
      title: "Lager", subtitle: "Forråd & køleskab",
      stockHeading: "📦 Fast forråd", stockSub: "Altid-i-huset — tryk = på lager. Indkøbslisten springer disse varer over.",
      fridgeHeading: "🧊 Køleskab & friskvarer", fridgeSub: "Det der ofte ændrer sig. Vedligehold manuelt eller scan med foto.",
      addCustom: "Tilføj egen vare…", addItem: "Vare", category: "Kategori",
      fridgeItemPlaceholder: "f.eks. ½ squash", fridgeQtyPlaceholder: "Mængde/note", usedUp: "brugt op",
      fridgeEmpty: "Køleskabet er tomt.<br>Skriv varer eller scan fotos.",
      scan: "📷 Scan køleskab", scanHint: "1–3 fotos. Vision-modellen genkender synlige fødevarer.",
      catalogHeading: "🧺 Tilføj fra kataloget", catalogHint: "Tryk på varer — med symbol, som på indkøbslisten.",
      scanAnalyze: "Analysér fotos", scanStaging: "Genkendt — tjek og tilføj:",
      scanAdd: "Tilføj til køleskabsliste", scanLocked: "🔒 Scan kræver din API-nøgle (Indstillinger).", scanOffline: "Offline — foto-scanningen kræver internet. Du kan stadig tilføje varer manuelt.",
      onStockCount: "{n} på lager", scanNone: "Intet genkendt — prøv et skarpere foto.",
      duplicate: "„{n}“ er allerede på listen — overskriv?",
    },
    settings: {
      title: "Indstillinger",
      aiHeading: "🔑 AI (egen Anthropic-nøgle)",
      aiNote: "Bring Your Own Key: Nøglen bliver <strong>kun på denne enhed</strong> (localStorage), synkroniseres aldrig til Drive og sendes kun direkte til Anthropic-API’en. Omkostninger går via din Anthropic-konto.",
      apiKey: "API-nøgle", keySave: "Gem", keyTest: "Test forbindelse", keyRemove: "Fjern",
      keyActive: "✓ Nøgle gemt — AI-funktioner aktive.", keyStored: "✓ Gemt — AI-funktioner aktive.",
      keyRemoved: "Nøgle fjernet — AI-funktioner deaktiveret. Alt andet kører videre.",
      keyNone: "Ingen nøgle indtastet.", keyTesting: "Tester…", keyOk: "✓ Forbindelse ok — {m}{vision}.",
      keyVision: " (vision-egnet)", keyBad: "✗ {e}", keyWeird: "Det ligner ikke en Anthropic-nøgle (starter normalt med sk-ant-). Gem alligevel?",
      model: "Model",
      lagerHeading: "🥫 Forråd & køleskab", lagerNote: "Administrér forråd og friskvarer — inkl. foto-scan.",
      lagerOpen: "📦 Åbn Lager",
      profileHeading: "👨‍🍳 Kokkeprofil (til AI’en)",
      profileNote: "Det former hvad AI’en foreslår — kost, tempo, udstyr. Frit redigerbart.",
      profileLevel: "Kokkeniveau", profileDiet: "Kost", profileServings: "Portioner",
      profileWeekday: "Hverdage", profileWeekend: "Weekend", profileShopping: "Indkøbsmuligheder",
      profileEquipment: "Køkkenudstyr", profileSpices: "Krydderier i huset", profileNotes: "Yderligere noter (valgfrit)",
      profileSave: "Gem profil", profileReset: "Nulstil til standard",
      profileSaved: "✓ Profil gemt.", profileResetDone: "✓ Nulstillet til standard.",
      driveHeading: "☁️ Google Drive",
      driveNote: "Valgfrit. Synkroniserer <code>rezepte.json</code> på tværs af dine enheder — appen virker fuldt ud uden Drive (lokalt).",
      driveConnect: "Forbind med Google", driveSync: "Synkronisér nu", driveDisconnect: "Afbryd",
      driveConnected: "☁️ Forbundet · {s}", driveNot: "Ikke forbundet — data kun lokalt på denne enhed.",
      driveConfirmDisconnect: "Afbryd Drive? Opskrifterne bliver lokalt; sync stopper.",
      themeHeading: "🎨 Tema", themeSystem: "🌗 Følg system", themeLight: "☀️ Lys", themeDark: "🌙 Mørk",
      langHeading: "🌍 Language / Sprache / Idioma",
      aboutHeading: "ℹ️ App", aboutLine: "Build {b} · {n} opskrifter · skema v3 · kilde: {src}",
      guideBtn: "ℹ️ Funktioner & versioner", srcDrive: "Google Drive", srcLocal: "lokal",
    },
    guide: {
      title: "Funktioner & versioner", version: "Koch v{v}", updated: "Opdateret: {d}",
      byokHeading: "🤖 AI-funktioner (BYOK)",
      byokBody: "AI-funktionerne bruger din <strong>egen Anthropic-API-nøgle</strong>. Sådan:<br>1. Opret en nøgle på <a href=\"https://console.anthropic.com\" target=\"_blank\" rel=\"noopener\">console.anthropic.com</a>.<br>2. Indsæt den i Indstillinger — den bliver kun i din browser (localStorage).<br>3. Låser op: opskrift-foto-scan, URL-import, køleskabs-scan, AI-forslag.<br>Kald går direkte fra din browser til Anthropic — aldrig til vores egen server.",
      changelogHeading: "🆕 Nyt",
      feats: {
        cookbookT: "📖 Kogebog", cookbookB: "Gennemse, søg, filtrér efter kategori/køkken/sæson, favoritter & vurderinger.",
        captureT: "✏️ Tilføj opskrifter", captureB: "Manuelt, via foto-scan (AI) eller URL-import (AI) — altid tjekket før du gemmer.",
        cookingT: "👨‍🍳 Kogetilstand", cookingB: "Fuld skærm, portionsberegner, trin-timere, skærm forbliver tændt.",
        plannerT: "🗓️ Madplan", plannerB: "Automatisk ugeplan: hverdag/weekend, lås dage, slå om, rester-dage.",
        shoppingT: "🛒 Indkøbsliste", shoppingB: "Genereret fra planen; lagervarer trækkes automatisk fra.",
        lagerT: "📦 Lager", lagerB: "Fast forråd (til/fra) + køleskabs-friskvarer med AI-foto-scan.",
        aiT: "🤖 AI-funktioner", aiB: "Kræver din egen API-nøgle (se nedenfor).",
      },
    },
    onboarding: { pick: "Vælg sprog", pickSub: "Language · Sprache" },
    errors: {
      nokey: "Ingen API-nøgle angivet (Indstillinger → AI).",
      offline: "Offline — AI kræver internetforbindelse.",
      auth: "API-nøgle ugyldig eller tilbagekaldt. Tjek den i Indstillinger.",
      ratelimit: "Rate-grænse nået — vent lidt og prøv igen.",
      overloaded: "Anthropic-API’en er overbelastet lige nu — prøv igen om lidt.",
      captureDisabled: "Automatisk billede-/URL-analyse er stadig deaktiveret (kommer i en senere opdatering).",
    },
  },
};

/* ============================================================
   MONATS-ÜBERSETZUNG — tLastCooked() parst "Mai 2026" → Zielsprache.
   DE-Namen entsprechen toLocaleDateString("de-DE", {month:"long"}).
   ============================================================ */
const DE_MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const MONTH_DICT = {
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
  da: ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"],
};

/* ============================================================
   KÜCHE-LABELS — Anzeige-Übersetzung der bekannten Küche-Werte.
   Schlüssel = kanonischer DE-String aus den Basis-Rezepten.
   Fallback (unbekannt / DE): canonical zurück (kein Absturz).
   ============================================================ */
const CUISINE_DICT = {
  en: {
    "Asiatisch": "Asian", "Deutsch": "German", "Französisch": "French",
    "International": "International", "Italienisch": "Italian",
    "Mediterran": "Mediterranean", "Mexikanisch": "Mexican", "Middle Eastern": "Middle Eastern",
  },
  es: {
    "Asiatisch": "Asiática", "Deutsch": "Alemana", "Französisch": "Francesa",
    "International": "Internacional", "Italienisch": "Italiana",
    "Mediterran": "Mediterránea", "Mexikanisch": "Mexicana", "Middle Eastern": "Oriente Medio",
  },
  da: {
    "Asiatisch": "Asiatisk", "Deutsch": "Tysk", "Französisch": "Fransk",
    "International": "International", "Italienisch": "Italiensk",
    "Mediterran": "Middelhav", "Mexikanisch": "Mexicansk", "Middle Eastern": "Mellemøstlig",
  },
};

/* ============================================================
   SAISON-LABELS — Anzeige-Übersetzung der bekannten Saison-Werte.
   ============================================================ */
const SEASON_DICT = {
  en: { "Herbst": "Autumn", "Sommer": "Summer", "Spätsommer": "Late summer", "Winter": "Winter" },
  es: { "Herbst": "Otoño", "Sommer": "Verano", "Spätsommer": "Finales de verano", "Winter": "Invierno" },
  da: { "Herbst": "Efterår", "Sommer": "Sommer", "Spätsommer": "Sensommer", "Winter": "Vinter" },
};

/* ============================================================
   KATEGORIE-LABELS — Anzeige-Übersetzung der 16 festen Kategorien.
   Schlüssel = kanonischer DE-Enum-String (schema.js CATEGORIES).
   DE braucht keinen Eintrag (Identität via Fallback in tCat).
   ============================================================ */
const CAT_DICT = {
  en: {
    "Frühstück & Brunch": "Breakfast & brunch",
    "Schnelle Wochentags-Gerichte": "Quick weekday meals",
    "Pasta & Nudeln": "Pasta & noodles",
    "Reis & Getreide": "Rice & grains",
    "Suppen & Eintöpfe": "Soups & stews",
    "Salate & leichte Gerichte": "Salads & light meals",
    "Wochenend-Gerichte": "Weekend dishes",
    "Vegetarische Hauptgerichte": "Vegetarian mains",
    "Deutsche Hausmannskost": "German home cooking",
    "Middle Eastern & Mediterran": "Middle Eastern & Mediterranean",
    "Asiatisch inspiriert": "Asian-inspired",
    "Backen: Brot & Herzhaftes": "Baking: bread & savory",
    "Backen: Süßes & Kuchen": "Baking: sweets & cakes",
    "Muffins & Kleingebäck": "Muffins & small bakes",
    "Sourdough & Sauerteig": "Sourdough",
    "Grundrezepte & Basissoßen": "Basics & base sauces",
  },
  es: {
    "Frühstück & Brunch": "Desayuno y brunch",
    "Schnelle Wochentags-Gerichte": "Platos rápidos entre semana",
    "Pasta & Nudeln": "Pasta y fideos",
    "Reis & Getreide": "Arroz y cereales",
    "Suppen & Eintöpfe": "Sopas y guisos",
    "Salate & leichte Gerichte": "Ensaladas y platos ligeros",
    "Wochenend-Gerichte": "Platos de fin de semana",
    "Vegetarische Hauptgerichte": "Principales vegetarianos",
    "Deutsche Hausmannskost": "Cocina casera alemana",
    "Middle Eastern & Mediterran": "Middle Eastern y mediterráneo",
    "Asiatisch inspiriert": "De inspiración asiática",
    "Backen: Brot & Herzhaftes": "Horno: pan y salado",
    "Backen: Süßes & Kuchen": "Horno: dulces y pasteles",
    "Muffins & Kleingebäck": "Magdalenas y bollería",
    "Sourdough & Sauerteig": "Masa madre",
    "Grundrezepte & Basissoßen": "Básicos y salsas base",
  },
  da: {
    "Frühstück & Brunch": "Morgenmad & brunch",
    "Schnelle Wochentags-Gerichte": "Hurtige hverdagsretter",
    "Pasta & Nudeln": "Pasta & nudler",
    "Reis & Getreide": "Ris & korn",
    "Suppen & Eintöpfe": "Supper & sammenkogte retter",
    "Salate & leichte Gerichte": "Salater & lette retter",
    "Wochenend-Gerichte": "Weekendretter",
    "Vegetarische Hauptgerichte": "Vegetariske hovedretter",
    "Deutsche Hausmannskost": "Tysk husmandskost",
    "Middle Eastern & Mediterran": "Middle Eastern & middelhav",
    "Asiatisch inspiriert": "Asiatisk inspireret",
    "Backen: Brot & Herzhaftes": "Bagning: brød & madbrød",
    "Backen: Süßes & Kuchen": "Bagning: søde sager & kager",
    "Muffins & Kleingebäck": "Muffins & småkager",
    "Sourdough & Sauerteig": "Surdej",
    "Grundrezepte & Basissoßen": "Basisopskrifter & grundsovse",
  },
};
