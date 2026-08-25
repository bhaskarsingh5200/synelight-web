-- ============================================================
-- SYNELIGHT — leads table, constraints, RLS, indexes
-- Run once in the Supabase SQL editor for your project.
--
-- Security model:
--   * The website's Node server inserts/reads leads using the
--     service_role key (bypasses RLS by design) — the key never
--     reaches the browser.
--   * RLS is ENABLED with NO public policies: anon/authenticated
--     roles can neither read, update, delete nor insert directly.
--   * If you ever want direct browser inserts instead of going
--     through POST /api/leads, create an explicit INSERT-only
--     policy for the anon role (see bottom) — otherwise leave it off.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Table ----------
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  full_name     text        not null,
  business_name text        not null default '',
  email         text        not null,
  whatsapp      text        not null default '',
  website       text        not null default '',
  business_type text        not null,
  service       text        not null,
  timeline      text        not null default '',
  budget        text        not null default '',
  description   text        not null,
  source        text        not null default 'website',
  utm_source    text        not null default '',
  utm_medium    text        not null default '',
  utm_campaign  text        not null default '',
  assigned_to   text        not null default '',
  status        text        not null default 'NEW',
  notes         text        not null default ''
);

-- ---------- Controlled status values ----------
alter table public.leads
  add constraint leads_status_check
  check (status in (
    'NEW', 'CONTACTED', 'QUALIFIED', 'CALL_BOOKED',
    'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'
  ));

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------- Indexes ----------
create index if not exists leads_email_idx      on public.leads (email);
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_created_idx    on public.leads (created_at desc);
create index if not exists leads_service_idx    on public.leads (service);

-- ---------- Row Level Security ----------
alter table public.leads enable row level security;

-- No policies are created on purpose.
-- With RLS enabled and zero policies:
--   anon / authenticated -> zero rows readable, no writes permitted.

-- OPTIONAL (only if switching to client-side inserts):
-- create policy "anon can insert leads"
--   on public.leads for insert to anon
--   with check (true);

-- ---------- Retention (spec: configurable, no silent deletion) ----------
-- The server does NOT auto-delete leads. To archive older records,
-- run periodically (e.g. monthly via Supabase scheduled job):
--   insert into leads_archive select * from public.leads where created_at < now() - interval '24 months';
--   delete from public.leads       where created_at < now() - interval '24 months';
