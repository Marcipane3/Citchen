-- P7 (v2.15b): Härtung des Freunde-Postfachs (I3). Baut auf 20261004182000_i3_friend_inbox.sql auf.
-- Getestet mit supabase/tests/run.sh (frische Datenbank nur aus den Migrationen dieses Ordners).
--
-- AR-12: fl_create war eine offene Kapazitätsfalle — jeder mit dem (öffentlichen) Publishable Key
-- konnte die 500 Plätze mit Listen füllen, danach hätte niemand mehr einen Freunde-Link anlegen können.
-- Ohne Konten gibt es keinen echten Herkunftsnachweis; deshalb drei einfache Bremsen:
--   1. höchstens 30 neue Listen pro Stunde (alle zusammen) → Fehler „rate“,
--   2. verlassene Listen räumt jeder fl_create-Aufruf zuerst weg:
--      - nie benutzt: kein Schaufenster veröffentlicht und älter als 7 Tage
--        (die App veröffentlicht direkt nach dem Anlegen und bei jeder Listenänderung),
--      - 120 Tage kein Aufruf des Besitzers (die App ruft bei jedem Öffnen fl_pull auf),
--   3. das Limit von 500 Listen bleibt (Fehler „capacity“).
-- Eine aufgeräumte Liste meldet der App beim nächsten Abholen „not_found“ → Status „gone“
-- („Dieser Freunde-Link existiert nicht mehr — schalte ihn aus und erstelle einen neuen.“).

create index if not exists friend_lists_created_idx on public.friend_lists(created_at);
create index if not exists friend_lists_last_seen_idx on public.friend_lists(last_seen);

-- Verlassene Listen entfernen (Freundes-Artikel gehen per ON DELETE CASCADE mit). Nur intern.
create or replace function public._fl_cleanup()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.friend_lists
   where (snapshot_at is null and created_at < now() - interval '7 days')
      or last_seen < now() - interval '120 days';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fl_create(p_owner_token text, p_owner_name text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_invite text;
begin
  if p_owner_token is null or char_length(p_owner_token) < 32 then raise exception 'bad_token'; end if;
  perform public._fl_cleanup();
  if (select count(*) from public.friend_lists where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate';
  end if;
  if (select count(*) from public.friend_lists) >= 500 then raise exception 'capacity'; end if;
  v_invite := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.friend_lists(owner_hash, invite_token, owner_name)
  values (encode(extensions.digest(p_owner_token, 'sha256'), 'hex'), v_invite, nullif(left(trim(p_owner_name), 40), ''));
  return v_invite;
end $$;

revoke all on function public._fl_cleanup() from public, anon, authenticated;
revoke all on function public.fl_create(text, text) from public;
grant execute on function public.fl_create(text, text) to anon, authenticated;
