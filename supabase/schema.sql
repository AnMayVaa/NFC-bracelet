-- Jeju wish-band database for Supabase (Postgres).
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- Safe to run again; it only creates what is missing and replaces the views.

-- One row per wish-band. `data` holds the full record the app uses;
-- the other columns are copies so the Table Editor is easy to read and filter.
create table if not exists public.tourists (
  uid               text primary key,
  name              text,
  country           text,
  language          text,
  dietary           text,
  emergency_contact text,
  stamps            int  not null default 0,
  voucher_status    text not null default 'LOCKED',
  voucher_code      text,
  last_checkin_at   timestamptz,
  last_lat          double precision,
  last_lng          double precision,
  registered_at     timestamptz,
  data              jsonb not null,
  updated_at        timestamptz not null default now()
);

-- One row per SOS alert.
create table if not exists public.sos_alerts (
  alert_id          text primary key,
  uid               text not null,
  status            text not null,
  tourist_name      text,
  emergency_contact text,
  lat               double precision,
  lng               double precision,
  location_source   text,
  note              text,
  triggered_at      timestamptz not null,
  data              jsonb not null,
  updated_at        timestamptz not null default now()
);

create index if not exists sos_alerts_status_idx on public.sos_alerts (status);
create index if not exists sos_alerts_uid_idx on public.sos_alerts (uid);

-- Only the server (service role key) may read or write. With RLS on and no
-- policies, the public anon key sees nothing, so the data stays private.
alter table public.tourists   enable row level security;
alter table public.sos_alerts enable row level security;

-- Read-only views for checking the demo in the Table Editor or SQL Editor.
-- Every stamp tap, newest first.
create or replace view public.checkins with (security_invoker = true) as
select t.uid,
       t.name,
       h->>'station'                    as station,
       h->>'kind'                       as kind,
       (h->>'timestamp')::timestamptz   as tapped_at,
       (h->>'visitSequence')::int       as visit_number,
       (h->>'isNewStamp')::boolean      as new_stamp
from public.tourists t,
     jsonb_array_elements(coalesce(t.data->'checkinHistory', '[]'::jsonb)) h
order by tapped_at desc;

-- Last-location log (station taps and phone GPS), newest first.
create or replace view public.location_log with (security_invoker = true) as
select t.uid,
       t.name,
       l->>'source'                     as source,
       l->>'station'                    as station,
       (l->>'lat')::double precision    as lat,
       (l->>'lng')::double precision    as lng,
       (l->>'timestamp')::timestamptz   as at
from public.tourists t,
     jsonb_array_elements(coalesce(t.data->'locationLog', '[]'::jsonb)) l
order by at desc;

-- AI pick events (shown / opened / visited) for the conversion rate.
create or replace view public.recommendation_events with (security_invoker = true) as
select t.uid,
       e->>'itemId'                     as item_id,
       e->>'stationId'                  as station_id,
       e->>'action'                     as action,
       (e->>'timestamp')::timestamptz   as at
from public.tourists t,
     jsonb_array_elements(coalesce(t.data->'recEvents', '[]'::jsonb)) e
order by at desc;
