#!/usr/bin/env bash
# run.sh — P7 (v2.15b): „Ein frisches Projekt lässt sich aus dem Repo neu aufbauen“, bewiesen.
# Startet eine WEGWERF-Postgres-Datenbank, spielt nur supabase/migrations/*.sql (in Namensreihenfolge)
# ein und testet das Freunde-Postfach so, wie App und Freunde-Seite es sehen: als Rolle `anon`.
# Keine Verbindung zu Supabase, keine echten Daten. Braucht Postgres ≥ 15 lokal (initdb, pg_ctl, psql).
#
#   bash supabase/tests/run.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
INITDB=$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1 || true)
[ -n "$INITDB" ] || { echo "Postgres (initdb) nicht gefunden — bitte Postgres ≥ 15 installieren." >&2; exit 2; }
BIN=$(dirname "$INITDB")
PORT=${PGTEST_PORT:-54329}
TMP=$(mktemp -d)
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$TMP"
cleanup() { as_pg "$BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

as_pg "$BIN/initdb" -D "$TMP/data" -A trust -U postgres >/dev/null
as_pg "$BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "create database koch_test"
"${PSQL[@]}" -d koch_test -f "$HERE/00_supabase_shim.sql"
for f in "$ROOT"/migrations/*.sql; do
  echo "▶ Migration $(basename "$f")"
  "${PSQL[@]}" -d koch_test -f "$f"
done
for f in "$HERE"/[1-9]*.sql; do
  echo "▶ Test $(basename "$f")"
  "${PSQL[@]}" -d koch_test -o /dev/null -f "$f"   # Ergebnisse stumm; ein Fehler bricht mit Meldung ab
done
echo "✓ Datenbank aus den Migrationen neu aufgebaut, alle Tests grün"
