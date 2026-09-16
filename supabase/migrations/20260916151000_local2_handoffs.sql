create table if not exists public.local2_handoffs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid references public.local2_conversations(id) on delete set null,
  session_id uuid references public.local2_customer_sessions(id) on delete set null,
  customer_id uuid references public.local2_customers(id) on delete set null,
  status text not null default 'open' check (status in ('open','resolved','cancelled')),
  reason text,
  last_customer_message text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists local2_handoffs_business_status_idx
  on public.local2_handoffs (business_id, status, created_at desc);

create unique index if not exists local2_handoffs_one_open_per_conversation_idx
  on public.local2_handoffs (conversation_id)
  where status = 'open' and conversation_id is not null;

alter table public.local2_handoffs enable row level security;

drop policy if exists "Local2 owners manage handoffs" on public.local2_handoffs;
create policy "Local2 owners manage handoffs"
  on public.local2_handoffs
  for all
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = local2_handoffs.business_id
        and b.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = local2_handoffs.business_id
        and b.owner_id = (select auth.uid())
    )
  );

revoke all on table public.local2_handoffs from anon;
grant select, insert, update, delete on table public.local2_handoffs to authenticated;
