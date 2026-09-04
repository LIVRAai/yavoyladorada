drop policy if exists "Owners can read their businesses" on public.businesses;
drop policy if exists "Owners can create businesses" on public.businesses;
drop policy if exists "Owners can update businesses" on public.businesses;
drop policy if exists "Public can read visible businesses" on public.businesses;

create policy "Anon can read visible businesses"
on public.businesses
for select
to anon
using (
  (trial_started_at is null and status = 'active')
  or
  (
    trial_started_at is not null
    and (
      (now() < grace_ends_at and status in ('active', 'pending_payment'))
      or
      (status = 'active' and private.local_has_paid_membership(id))
    )
  )
);

create policy "Authenticated can read own or visible businesses"
on public.businesses
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or
  (
    (trial_started_at is null and status = 'active')
    or
    (
      trial_started_at is not null
      and (
        (now() < grace_ends_at and status in ('active', 'pending_payment'))
        or
        (status = 'active' and private.local_has_paid_membership(id))
      )
    )
  )
);

create policy "Owners can create businesses"
on public.businesses
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners can update businesses"
on public.businesses
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can read their subscriptions" on public.business_subscriptions;
create policy "Owners can read their subscriptions"
on public.business_subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = business_subscriptions.business_id
      and b.owner_id = (select auth.uid())
  )
);

create index if not exists businesses_grace_ends_at_idx
on public.businesses(grace_ends_at)
where trial_started_at is not null;
