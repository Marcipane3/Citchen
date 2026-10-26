-- 10_friend_inbox.sql — Tests für das Freunde-Postfach (I3 + P7), nach allen Migrationen.
-- App und Freunde-Seite rufen die Datenbank als Rolle `anon` (Publishable Key) — genau so wird hier
-- getestet. Daten für Sonderfälle (alte Listen, volle Kapazität) legt `postgres` direkt an.

create schema tests;
grant usage on schema tests to anon;

-- Erwartet, dass p_sql mit einer Meldung LIKE p_like scheitert.
create function tests.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_like then return; end if;
    raise exception 'FEHLER: % → erwartet „%“, bekam „%“', p_sql, p_like, sqlerrm;
  end;
  raise exception 'FEHLER: % → erwartet „%“, lief aber durch', p_sql, p_like;
end $$;

create function tests.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FEHLER: %', p_what; end if;
end $$;

grant execute on all functions in schema tests to anon;

/* ---------- 1. anon kommt an keine Tabelle und an keine interne Funktion ---------- */
set role anon;
select tests.expect_error('select * from public.friend_lists', 'permission denied%');
select tests.expect_error('select * from public.friend_items', 'permission denied%');
select tests.expect_error($q$insert into public.friend_items(list_id, name) values (gen_random_uuid(), 'x')$q$, 'permission denied%');
select tests.expect_error($q$update public.friend_lists set owner_name = 'x'$q$, 'permission denied%');
select tests.expect_error($q$select public._fl_owner(repeat('a', 64))$q$, 'permission denied%');
select tests.expect_error($q$select public._fl_cleanup()$q$, 'permission denied%');
reset role;

/* ---------- 2. Ablauf wie in der App: anlegen, ansehen, hinzufügen, abholen, quittieren ---------- */
set role anon;
do $$
declare
  tok text := repeat('a', 64);
  other text := repeat('b', 64);
  inv text; inv_other text; inv2 text; v jsonb; n int; ids uuid[];
begin
  perform tests.expect_error($q$select public.fl_create('zu-kurz')$q$, 'bad_token');
  inv := public.fl_create(tok, '  Marcel  ');
  perform tests.ok(char_length(inv) = 32, 'Einladungs-Token hat 32 Hex-Zeichen');
  inv_other := public.fl_create(other, null);

  v := public.fl_view(inv);
  perform tests.ok(v->>'owner' = 'Marcel', 'Name getrimmt');
  perform tests.ok(public.fl_view('gibt-es-nicht') is null, 'unbekannter Link → null');

  perform public.fl_publish(tok, '[{"n":"Brot","i":"🍞","c":"Brot","q":1}]'::jsonb);
  perform tests.ok(public.fl_view(inv)->'items'->0->>'n' = 'Brot', 'Schaufenster sichtbar');
  perform tests.expect_error(format('select public.fl_publish(%L, %L::jsonb)', tok, '{"n":1}'), 'bad_snapshot');
  perform tests.expect_error(format('select public.fl_publish(%L, (select jsonb_agg(x) from generate_series(1,301) x))', tok), 'bad_snapshot');

  perform public.fl_add(inv, '  Hafermilch ', 'Anna');
  perform tests.expect_error(format('select public.fl_add(%L, %L)', inv, '   '), 'empty');
  perform tests.expect_error(format('select public.fl_add(%L, %L)', 'falsch', 'Milch'), 'not_found');
  perform tests.ok(public.fl_view(inv)->'pending'->0->>'name' = 'Hafermilch', 'Vorschlag im Postfach sichtbar');

  select array_agg(p.id) into ids from public.fl_pull(tok) p;
  perform tests.ok(array_length(ids, 1) = 1, 'Besitzer holt 1 Vorschlag ab');
  perform tests.ok(public.fl_ack(other, ids) = 0, 'fremder Besitzer kann nichts quittieren');
  perform tests.ok(public.fl_ack(tok, ids) = 1, 'quittieren löscht');
  perform tests.ok((select count(*) from public.fl_pull(tok)) = 0, 'danach leer');
  perform tests.expect_error(format('select * from public.fl_pull(%L)', repeat('c', 64)), 'not_found');

  -- Spam-Bremsen pro Liste: 20 pro Minute
  for i in 1..20 loop perform public.fl_add(inv, 'Artikel ' || i); end loop;
  perform tests.expect_error(format('select public.fl_add(%L, %L)', inv, 'einer zu viel'), 'rate');

  -- neuer Link: alter ungültig
  inv2 := public.fl_rotate(tok);
  perform tests.ok(public.fl_view(inv) is null and public.fl_view(inv2) is not null, 'rotate macht den alten Link ungültig');
  perform public.fl_set_name(tok, '');
  perform tests.ok(public.fl_view(inv2)->>'owner' is null, 'leerer Name → null');

  perform public.fl_delete(tok);
  perform tests.ok(public.fl_view(inv2) is null, 'ausgeschaltet → alles weg');
  perform tests.expect_error(format('select public.fl_rotate(%L)', tok), 'not_found');
  perform public.fl_delete(other);
end $$;
reset role;

/* ---------- 3. Volles Postfach: höchstens 100 offene Vorschläge ---------- */
do $$
declare lid uuid;
begin
  insert into public.friend_lists(owner_hash, invite_token, snapshot_at)
  values ('h-voll', 'inv-voll', now()) returning id into lid;
  insert into public.friend_items(list_id, name, created_at)
  select lid, 'x' || g, now() - interval '1 hour' from generate_series(1, 100) g;
end $$;
set role anon;
select tests.expect_error($q$select public.fl_add('inv-voll', 'noch einer')$q$, 'full');
reset role;
delete from public.friend_lists;

/* ---------- 4. P7 / AR-12: verlassene Listen werden beim Anlegen aufgeräumt ---------- */
insert into public.friend_lists(owner_hash, invite_token, created_at, last_seen, snapshot_at) values
  ('h-nie-benutzt', 'i1', now() - interval '8 days',   now() - interval '8 days',   null),       -- weg
  ('h-frisch',      'i2', now() - interval '2 days',   now() - interval '2 days',   null),       -- bleibt (< 7 Tage)
  ('h-inaktiv',     'i3', now() - interval '200 days', now() - interval '121 days', now() - interval '121 days'), -- weg
  ('h-aktiv',       'i4', now() - interval '200 days', now() - interval '3 days',   now() - interval '3 days');   -- bleibt
insert into public.friend_items(list_id, name) select id, 'Vorschlag' from public.friend_lists where owner_hash = 'h-inaktiv';
set role anon;
select public.fl_create(repeat('d', 64), 'Neu') is not null;
reset role;
select tests.ok((select array_agg(owner_hash order by owner_hash) from public.friend_lists where owner_hash like 'h-%')
                = array['h-aktiv', 'h-frisch'], 'nie benutzte (> 7 Tage) und inaktive (> 120 Tage) Listen sind weg');
select tests.ok((select count(*) from public.friend_items) = 0, 'ihre Vorschläge gehen mit (ON DELETE CASCADE)');
delete from public.friend_lists;

/* ---------- 5. P7 / AR-12: höchstens 30 neue Listen pro Stunde ---------- */
insert into public.friend_lists(owner_hash, invite_token, created_at, snapshot_at)
select 'h-r' || g, 'i-r' || g, now() - interval '10 minutes', now() from generate_series(1, 30) g;
set role anon;
select tests.expect_error($q$select public.fl_create(repeat('e', 64))$q$, 'rate');
reset role;
update public.friend_lists set created_at = now() - interval '2 hours';
set role anon;
select public.fl_create(repeat('e', 64)) is not null;  -- eine Stunde später geht es wieder
reset role;
delete from public.friend_lists;

/* ---------- 6. Kapazität: 500 Listen ---------- */
insert into public.friend_lists(owner_hash, invite_token, created_at, snapshot_at)
select 'h-c' || g, 'i-c' || g, now() - interval '2 days', now() from generate_series(1, 500) g;
set role anon;
select tests.expect_error($q$select public.fl_create(repeat('f', 64))$q$, 'capacity');
reset role;
delete from public.friend_lists;

/* ---------- 7. Rechte nach allen Migrationen: nur die fl_*-Funktionen sind für anon offen ---------- */
select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute'))
  = array['fl_ack', 'fl_add', 'fl_create', 'fl_delete', 'fl_publish', 'fl_pull', 'fl_rotate', 'fl_set_name', 'fl_view'],
  'anon darf genau die 9 fl_*-Funktionen ausführen');
select tests.ok(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r'
                 and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
                      or has_table_privilege('authenticated', c.oid, 'select'))),
  'keine Tabelle in public ist für anon/authenticated lesbar oder beschreibbar');
select tests.ok(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'Row-Level-Security ist auf jeder Tabelle an');
select tests.ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prosecdef
                 and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  'jede SECURITY-DEFINER-Funktion hat einen festen search_path');
