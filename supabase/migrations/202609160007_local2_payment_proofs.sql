-- Local 2.0 Beta
-- Payment proof flow: private receipt storage + owner review actions.

alter table public.local2_payments
  add column if not exists proof_path text,
  add column if not exists proof_file_name text,
  add column if not exists proof_mime_type text,
  add column if not exists proof_size_bytes bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'local2_payments_proof_size_check'
      and conrelid = 'public.local2_payments'::regclass
  ) then
    alter table public.local2_payments
      add constraint local2_payments_proof_size_check
      check (proof_size_bytes is null or (proof_size_bytes > 0 and proof_size_bytes <= 8388608));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'local2-payment-proofs',
  'local2-payment-proofs',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Only the owner of the business encoded in the first path segment can request a signed read URL.
drop policy if exists "Local2 owners read payment proofs" on storage.objects;
create policy "Local2 owners read payment proofs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'local2-payment-proofs'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = split_part(storage.objects.name, '/', 1)
      and b.owner_id = (select auth.uid())
  )
);

create or replace function public.local2_reject_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.local2_payments%rowtype;
  v_order public.local2_orders%rowtype;
begin
  select p.* into v_payment
  from public.local2_payments p
  join public.businesses b on b.id = p.business_id
  where p.id = p_payment_id
    and p.status = 'reported'
    and b.owner_id = auth.uid()
  for update of p;

  if not found then
    raise exception 'Pago no encontrado, ya revisado o sin autorización';
  end if;

  update public.local2_payments
  set status = 'rejected',
      confirmed_at = null,
      confirmed_by = null,
      updated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  update public.local2_orders
  set status = 'awaiting_payment', updated_at = now()
  where id = v_payment.order_id
  returning * into v_order;

  insert into public.local2_order_events (business_id, order_id, event_type, status, description)
  values (
    v_order.business_id,
    v_order.id,
    'payment_rejected',
    'awaiting_payment',
    'El comprobante fue revisado y el pago no pudo confirmarse. Puedes enviar un nuevo comprobante.'
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'order_code', v_order.public_code,
    'status', v_order.status
  );
end;
$$;

revoke all on function public.local2_reject_payment(uuid) from public;
grant execute on function public.local2_reject_payment(uuid) to authenticated;

create index if not exists local2_payments_proof_path_idx
  on public.local2_payments(proof_path)
  where proof_path is not null;
