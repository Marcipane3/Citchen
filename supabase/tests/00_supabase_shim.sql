-- 00_supabase_shim.sql — das Nötigste, was ein frisches Supabase-Projekt mitbringt, damit die
-- Migrationen hier lokal genauso laufen wie dort: Rollen anon/authenticated/service_role, Schema
-- `extensions`, und Supabases Standard-Rechte (neue Tabellen/Funktionen in `public` gehören erst einmal
-- allen API-Rollen — genau deshalb entziehen die Migrationen sie wieder; das prüfen die Tests mit).
-- NUR für supabase/tests/run.sh — nie auf ein echtes Projekt anwenden.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
