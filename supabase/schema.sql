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

-- Profiles live on the tourist's phone. The name / country / language / dietary /
-- emergency_contact columns stay only so older deploys keep working; the app writes null.
-- To clean rows saved before that change, run once:
--   update public.tourists set name = null, country = null, language = null, dietary = null, emergency_contact = null,
--     data = data - 'name' - 'country' - 'countryCode' - 'language' - 'dietary' - 'emergencyContact' - 'emergencyName'
--                 - 'emergencyRelation' - 'interests' - 'mobility' - 'medicalNotes' - 'onboardedAt' - 'lastUpdated';

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

-- ---------------------------------------------------------------- field trial + impact (added 2026-10)
-- The app keeps these inside `data`, so nothing new has to exist for it to run;
-- the views only make the trial easy to check in the SQL Editor.

-- Bands whose owner agreed to the field trial (withdrawn ones are left out), with survey answers.
create or replace view public.trial_participants with (security_invoker = true) as
select t.uid,
       t.data->>'countryCode'                         as country,
       (t.data->'trial'->>'consentAt')::timestamptz   as consented_at,
       t.data->'trial'->>'consentVersion'             as consent_version,
       (t.data->'trial'->'survey'->>'overall')::int   as survey_overall,
       (t.data->'trial'->'survey'->>'aiPicks')::int   as survey_ai_picks,
       (t.data->'trial'->'survey'->>'safety')::int    as survey_safety,
       t.data->'trial'->'survey'->>'comment'          as survey_comment,
       t.stamps,
       t.voucher_status
from public.tourists t
where t.data->'trial'->>'consentAt' is not null
  and t.data->'trial'->>'withdrawnAt' is null;

-- Redeemed vouchers and the shop that took them (impact panel).
create or replace view public.voucher_redemptions with (security_invoker = true) as
select t.uid,
       t.data->'voucher'->>'code'                      as code,
       t.data->'voucher'->>'shop'                      as shop,
       (t.data->'voucher'->>'redeemedAt')::timestamptz as redeemed_at
from public.tourists t
where t.data->'voucher'->>'status' = 'REDEEMED'
order by redeemed_at desc;

-- How each SOS was raised: phone (hold button), band (rapid taps at a station) or admin (demo).
create or replace view public.sos_triggers with (security_invoker = true) as
select a.alert_id,
       a.uid,
       a.status,
       coalesce(a.data->>'trigger', 'phone') as trigger,
       a.data->>'stationId'                  as station,
       a.location_source,
       a.triggered_at
from public.sos_alerts a
order by a.triggered_at desc;
