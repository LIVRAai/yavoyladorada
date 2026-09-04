create extension if not exists pg_cron;

alter table public.businesses
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists grace_ends_at timestamptz;

comment on column public.businesses.trial_started_at is 'Inicio de la prueba gratuita de Local. NULL identifica registros legacy previos al modelo de trial.';
comment on column public.businesses.trial_ends_at is 'Fin de los 8 días gratuitos.';
comment on column public.businesses.grace_ends_at is 'Fin de los 3 días adicionales de gracia.';

create or replace function public.local_has_paid_membership(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_subscriptions s
    where s.business_id = p_business_id
      and s.status = 'authorized'
      and s.last_payment_date is not null
  );
$$;

revoke all on function public.local_has_paid_membership(uuid) from public;
grant execute on function public.local_has_paid_membership(uuid) to anon, authenticated, service_role;

create or replace function public.local_initialize_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trial_started_at is null then
    new.trial_started_at := now();
  end if;
  if new.trial_ends_at is null then
    new.trial_ends_at := new.trial_started_at + interval '8 days';
  end if;
  if new.grace_ends_at is null then
    new.grace_ends_at := new.trial_started_at + interval '11 days';
  end if;
  new.status := 'active';
  return new;
end;
$$;

drop trigger if exists trg_local_initialize_trial on public.businesses;
create trigger trg_local_initialize_trial
before insert on public.businesses
for each row
execute function public.local_initialize_trial();

create or replace function public.local_protect_managed_business_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    new.status := old.status;
    new.trial_started_at := old.trial_started_at;
    new.trial_ends_at := old.trial_ends_at;
    new.grace_ends_at := old.grace_ends_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_local_protect_managed_business_fields on public.businesses;
create trigger trg_local_protect_managed_business_fields
before update on public.businesses
for each row
execute function public.local_protect_managed_business_fields();

create or replace function public.enforce_local_membership_lifecycle()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer := 0;
  step_count integer := 0;
begin
  update public.businesses b
     set status = 'active',
         updated_at = now()
   where b.trial_started_at is not null
     and b.status <> 'active'
     and public.local_has_paid_membership(b.id);
  get diagnostics step_count = row_count;
  changed_count := changed_count + step_count;

  update public.businesses b
     set status = 'suspended',
         updated_at = now()
   where b.trial_started_at is not null
     and b.grace_ends_at <= now()
     and b.status <> 'suspended'
     and not public.local_has_paid_membership(b.id);
  get diagnostics step_count = row_count;
  changed_count := changed_count + step_count;

  return changed_count;
end;
$$;

revoke all on function public.enforce_local_membership_lifecycle() from public;
grant execute on function public.enforce_local_membership_lifecycle() to service_role;

drop policy if exists "Public can read active businesses" on public.businesses;
drop policy if exists "Public can read visible businesses" on public.businesses;
create policy "Public can read visible businesses"
on public.businesses
for select
to public
using (
  (
    trial_started_at is null
    and status = 'active'
  )
  or
  (
    trial_started_at is not null
    and (
      (
        now() < grace_ends_at
        and status in ('active', 'pending_payment')
      )
      or
      (
        status = 'active'
        and public.local_has_paid_membership(id)
      )
    )
  )
);

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'local-membership-lifecycle-hourly'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'local-membership-lifecycle-hourly',
    '7 * * * *',
    'select public.enforce_local_membership_lifecycle();'
  );
end $$;
