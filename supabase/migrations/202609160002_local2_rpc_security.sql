-- Local 2.0 Beta: owner RPCs should respect the caller's RLS context.

create or replace function public.local2_confirm_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security invoker
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
    and b.owner_id = auth.uid()
  for update of p;

  if not found then
    raise exception 'Pago no encontrado o sin autorización';
  end if;

  update public.local2_payments
  set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  update public.local2_orders
  set status = 'payment_confirmed', updated_at = now()
  where id = v_payment.order_id
  returning * into v_order;

  insert into public.local2_order_events (business_id, order_id, event_type, status, description)
  values (v_order.business_id, v_order.id, 'payment_confirmed', 'payment_confirmed', 'Pago confirmado por el emprendimiento');

  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'order_code', v_order.public_code, 'status', v_order.status);
end;
$$;

revoke all on function public.local2_confirm_payment(uuid) from public;
revoke all on function public.local2_confirm_payment(uuid) from anon;
grant execute on function public.local2_confirm_payment(uuid) to authenticated;

create or replace function public.local2_set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.local2_orders%rowtype;
  v_allowed text[] := array['preparing','ready','delivered','cancelled'];
begin
  if not (p_status = any(v_allowed)) then
    raise exception 'Estado no permitido';
  end if;

  select o.* into v_order
  from public.local2_orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id
    and b.owner_id = auth.uid()
  for update of o;

  if not found then
    raise exception 'Pedido no encontrado o sin autorización';
  end if;

  update public.local2_orders
  set status = p_status, updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.local2_order_events (business_id, order_id, event_type, status, description)
  values (
    v_order.business_id,
    v_order.id,
    'status_changed',
    p_status,
    case p_status
      when 'preparing' then 'Pedido en preparación'
      when 'ready' then 'Pedido listo'
      when 'delivered' then 'Pedido entregado'
      when 'cancelled' then 'Pedido cancelado'
      else p_status
    end
  );

  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'order_code', v_order.public_code, 'status', v_order.status);
end;
$$;

revoke all on function public.local2_set_order_status(uuid, text) from public;
revoke all on function public.local2_set_order_status(uuid, text) from anon;
grant execute on function public.local2_set_order_status(uuid, text) to authenticated;
