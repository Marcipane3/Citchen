-- I3: Freunde-Einladungslink für die Einkaufsliste (angewendet 2026-10-04 auf Projekt wbvhgeqdixrcfeszsiob).
-- Supabase ist nur Postfach + Schaufenster: Drive bleibt die Quelle der Wahrheit.
-- Kein direkter Tabellenzugriff (RLS an, keine Policies) — alles läuft über RPC-Funktionen,
-- die das Besitzer-Token (nur als SHA-256-Hash gespeichert) bzw. das Einladungs-Token prüfen.
-- Supabase-Advisor meldet „SECURITY DEFINER von anon ausführbar“ — das ist hier Absicht:
-- jede Funktion prüft zuerst ein Token, und anon kommt sonst an nichts heran.

create extension if not exists pgcrypto with schema extensions;

create table public.friend_lists (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null unique,
  invite_token text not null unique,
  owner_name text check (char_length(owner_name) <= 40),
  snapshot jsonb not null default '[]'::jsonb,
  snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table public.friend_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.friend_lists(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  author text check (char_length(author) <= 40),
  created_at timestamptz not null default now()
);
create index friend_items_list_idx on public.friend_items(list_id, created_at);

alter table public.friend_lists enable row level security;
alter table public.friend_items enable row level security;
revoke all on public.friend_lists from anon, authenticated;
revoke all on public.friend_items from anon, authenticated;

create or replace function public._fl_owner(p_owner_token text)
returns public.friend_lists language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists;
begin
  if p_owner_token is null or char_length(p_owner_token) < 32 then raise exception 'bad_token'; end if;
  select * into r from public.friend_lists
   where owner_hash = encode(extensions.digest(p_owner_token, 'sha256'), 'hex');
  if not found then raise exception 'not_found'; end if;
  update public.friend_lists set last_seen = now() where id = r.id;
  return r;
end $$;

-- Besitzer: Liste anlegen (Token erzeugt die App lokal, Server speichert nur den Hash).
create or replace function public.fl_create(p_owner_token text, p_owner_name text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_invite text;
begin
  if p_owner_token is null or char_length(p_owner_token) < 32 then raise exception 'bad_token'; end if;
  if (select count(*) from public.friend_lists) >= 500 then raise exception 'capacity'; end if;
  v_invite := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.friend_lists(owner_hash, invite_token, owner_name)
  values (encode(extensions.digest(p_owner_token, 'sha256'), 'hex'), v_invite, nullif(left(trim(p_owner_name), 40), ''));
  return v_invite;
end $$;

-- Besitzer: neuer Link (alter wird ungültig).
create or replace function public.fl_rotate(p_owner_token text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists; v_invite text;
begin
  r := public._fl_owner(p_owner_token);
  v_invite := encode(extensions.gen_random_bytes(16), 'hex');
  update public.friend_lists set invite_token = v_invite where id = r.id;
  return v_invite;
end $$;

-- Besitzer: Anzeigename ändern.
create or replace function public.fl_set_name(p_owner_token text, p_owner_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists;
begin
  r := public._fl_owner(p_owner_token);
  update public.friend_lists set owner_name = nullif(left(trim(p_owner_name), 40), '') where id = r.id;
end $$;

-- Besitzer: offene Artikel als Schaufenster veröffentlichen ([{n,i,c,q}]).
create or replace function public.fl_publish(p_owner_token text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists;
begin
  r := public._fl_owner(p_owner_token);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 or pg_column_size(p_items) > 65536 then
    raise exception 'bad_snapshot';
  end if;
  update public.friend_lists set snapshot = p_items, snapshot_at = now() where id = r.id;
end $$;

-- Besitzer: neue Freundes-Artikel abholen (Löschen erst per fl_ack, nach lokalem Speichern).
create or replace function public.fl_pull(p_owner_token text)
returns table(id uuid, name text, author text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists;
begin
  r := public._fl_owner(p_owner_token);
  return query select i.id, i.name, i.author, i.created_at from public.friend_items i
    where i.list_id = r.id order by i.created_at;
end $$;

create or replace function public.fl_ack(p_owner_token text, p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists; n integer;
begin
  r := public._fl_owner(p_owner_token);
  delete from public.friend_items i where i.list_id = r.id and i.id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Besitzer: Freunde-Link komplett abschalten (löscht alles serverseitig).
create or replace function public.fl_delete(p_owner_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists;
begin
  r := public._fl_owner(p_owner_token);
  delete from public.friend_lists where id = r.id;
end $$;

-- Freund: Liste ansehen (offene Artikel + noch nicht abgeholte Vorschläge).
create or replace function public.fl_view(p_invite text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists;
begin
  select * into r from public.friend_lists where invite_token = p_invite;
  if not found then return null; end if;
  return jsonb_build_object(
    'owner', r.owner_name,
    'items', r.snapshot,
    'updated', r.snapshot_at,
    'pending', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'author', i.author) order by i.created_at)
                           from public.friend_items i where i.list_id = r.id), '[]'::jsonb));
end $$;

-- Freund: Artikel hinzufügen (Limits gegen Spam: 100 offen, 20 pro Minute).
create or replace function public.fl_add(p_invite text, p_name text, p_author text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.friend_lists; v_id uuid; v_name text := left(trim(coalesce(p_name, '')), 80);
begin
  select * into r from public.friend_lists where invite_token = p_invite;
  if not found then raise exception 'not_found'; end if;
  if v_name = '' then raise exception 'empty'; end if;
  if (select count(*) from public.friend_items where list_id = r.id) >= 100 then raise exception 'full'; end if;
  if (select count(*) from public.friend_items where list_id = r.id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate';
  end if;
  insert into public.friend_items(list_id, name, author)
  values (r.id, v_name, nullif(left(trim(coalesce(p_author, '')), 40), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public._fl_owner(text) from public, anon, authenticated;
revoke all on function public.fl_create(text, text), public.fl_rotate(text), public.fl_set_name(text, text),
  public.fl_publish(text, jsonb), public.fl_pull(text), public.fl_ack(text, uuid[]), public.fl_delete(text),
  public.fl_view(text), public.fl_add(text, text, text) from public;
grant execute on function public.fl_create(text, text), public.fl_rotate(text), public.fl_set_name(text, text),
  public.fl_publish(text, jsonb), public.fl_pull(text), public.fl_ack(text, uuid[]), public.fl_delete(text),
  public.fl_view(text), public.fl_add(text, text, text) to anon, authenticated;
