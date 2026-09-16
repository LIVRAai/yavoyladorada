create table if not exists public.local2_customer_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.local2_customers(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  source_type text,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.local2_customer_memory (
  customer_id uuid primary key references public.local2_customers(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  summary text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  facts jsonb not null default '{}'::jsonb,
  owner_notes text,
  conversation_count integer not null default 0,
  order_count integer not null default 0,
  delivered_order_count integer not null default 0,
  lifetime_value_cop numeric not null default 0,
  last_order_code text,
  last_order_status text,
  last_order_total_cop numeric,
  last_order_items jsonb not null default '[]'::jsonb,
  frequent_products jsonb not null default '[]'::jsonb,
  last_payment_method text,
  first_seen_at timestamptz,
  last_interaction_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists local2_customer_events_customer_idx on public.local2_customer_events(customer_id, occurred_at desc);
create index if not exists local2_customer_events_business_idx on public.local2_customer_events(business_id, occurred_at desc);
create unique index if not exists local2_customer_events_source_unique on public.local2_customer_events(source_type, source_id) where source_id is not null;
create index if not exists local2_customer_memory_business_idx on public.local2_customer_memory(business_id, last_interaction_at desc);

alter table public.local2_customer_events enable row level security;
alter table public.local2_customer_memory enable row level security;

drop policy if exists "Local2 owners manage local2_customer_events" on public.local2_customer_events;
create policy "Local2 owners manage local2_customer_events"
on public.local2_customer_events for all to authenticated
using (exists (select 1 from public.businesses b where b.id = local2_customer_events.business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.businesses b where b.id = local2_customer_events.business_id and b.owner_id = (select auth.uid())));

drop policy if exists "Local2 owners manage local2_customer_memory" on public.local2_customer_memory;
create policy "Local2 owners manage local2_customer_memory"
on public.local2_customer_memory for all to authenticated
using (exists (select 1 from public.businesses b where b.id = local2_customer_memory.business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.businesses b where b.id = local2_customer_memory.business_id and b.owner_id = (select auth.uid())));

create or replace function public.local2_refresh_customer_memory(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.local2_customers%rowtype;
  v_conversation_count integer := 0;
  v_order_count integer := 0;
  v_delivered_count integer := 0;
  v_lifetime numeric := 0;
  v_last_order public.local2_orders%rowtype;
  v_last_items jsonb := '[]'::jsonb;
  v_frequent jsonb := '[]'::jsonb;
  v_last_payment text;
  v_first_seen timestamptz;
  v_last_message timestamptz;
  v_last_event timestamptz;
  v_last_order_update timestamptz;
  v_last_interaction timestamptz;
  v_summary text;
begin
  select * into v_customer from public.local2_customers where id = p_customer_id;
  if not found then return; end if;

  select count(*)::integer into v_conversation_count
  from public.local2_conversations
  where customer_id = p_customer_id and business_id = v_customer.business_id;

  select count(*)::integer,
         count(*) filter (where status = 'delivered')::integer,
         coalesce(sum(total_cop) filter (where status = 'delivered'), 0)
  into v_order_count, v_delivered_count, v_lifetime
  from public.local2_orders
  where customer_id = p_customer_id and business_id = v_customer.business_id;

  select * into v_last_order
  from public.local2_orders
  where customer_id = p_customer_id and business_id = v_customer.business_id
  order by created_at desc
  limit 1;

  if v_last_order.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', oi.name_snapshot,
      'quantity', oi.quantity,
      'unit_price_cop', oi.unit_price_cop,
      'subtotal_cop', oi.subtotal_cop
    ) order by oi.created_at), '[]'::jsonb)
    into v_last_items
    from public.local2_order_items oi
    where oi.order_id = v_last_order.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', x.name_snapshot,
    'quantity', x.total_quantity,
    'orders', x.order_count
  ) order by x.total_quantity desc, x.order_count desc), '[]'::jsonb)
  into v_frequent
  from (
    select oi.name_snapshot,
           sum(oi.quantity)::integer as total_quantity,
           count(distinct oi.order_id)::integer as order_count
    from public.local2_order_items oi
    join public.local2_orders o on o.id = oi.order_id
    where o.customer_id = p_customer_id
      and o.business_id = v_customer.business_id
      and o.status <> 'cancelled'
    group by oi.name_snapshot
    order by total_quantity desc, order_count desc
    limit 5
  ) x;

  select p.method_type into v_last_payment
  from public.local2_payments p
  join public.local2_orders o on o.id = p.order_id
  where o.customer_id = p_customer_id and o.business_id = v_customer.business_id
  order by p.reported_at desc
  limit 1;

  select min(v) into v_first_seen from (
    select v_customer.created_at as v
    union all
    select min(c.created_at) from public.local2_conversations c where c.customer_id = p_customer_id and c.business_id = v_customer.business_id
    union all
    select min(o.created_at) from public.local2_orders o where o.customer_id = p_customer_id and o.business_id = v_customer.business_id
  ) s where v is not null;

  select max(m.created_at) into v_last_message
  from public.local2_messages m
  join public.local2_conversations c on c.id = m.conversation_id
  where c.customer_id = p_customer_id and c.business_id = v_customer.business_id;

  select max(e.occurred_at) into v_last_event
  from public.local2_customer_events e
  where e.customer_id = p_customer_id and e.business_id = v_customer.business_id;

  select max(o.updated_at) into v_last_order_update
  from public.local2_orders o
  where o.customer_id = p_customer_id and o.business_id = v_customer.business_id;

  v_last_interaction := greatest(
    coalesce(v_last_message, v_customer.updated_at, v_customer.created_at),
    coalesce(v_last_event, v_customer.updated_at, v_customer.created_at),
    coalesce(v_last_order_update, v_customer.updated_at, v_customer.created_at)
  );

  v_summary := concat_ws(' ',
    coalesce(v_customer.name, 'Este cliente') || ' tiene ' || v_conversation_count || ' conversación' || case when v_conversation_count = 1 then '' else 'es' end || ' y ' || v_order_count || ' pedido' || case when v_order_count = 1 then '' else 's' end || '.',
    case when v_delivered_count > 0 then 'Ha recibido ' || v_delivered_count || ' pedido' || case when v_delivered_count = 1 then '' else 's' end || ' por un valor acumulado de $' || to_char(v_lifetime, 'FM999G999G999G990') || '.' else null end,
    case when v_last_order.id is not null then 'Su último pedido es ' || v_last_order.public_code || ' y está en estado ' || v_last_order.status || '.' else null end,
    case when jsonb_array_length(v_frequent) > 0 then 'Productos frecuentes: ' || (select string_agg(value->>'name', ', ') from jsonb_array_elements(v_frequent)) || '.' else null end
  );

  insert into public.local2_customer_memory (
    customer_id, business_id, summary, conversation_count, order_count, delivered_order_count,
    lifetime_value_cop, last_order_code, last_order_status, last_order_total_cop,
    last_order_items, frequent_products, last_payment_method, first_seen_at, last_interaction_at,
    facts, updated_at
  ) values (
    p_customer_id, v_customer.business_id, v_summary, v_conversation_count, v_order_count, v_delivered_count,
    v_lifetime, v_last_order.public_code, v_last_order.status, v_last_order.total_cop,
    v_last_items, v_frequent, v_last_payment, v_first_seen, v_last_interaction,
    jsonb_build_object('customer_name', v_customer.name, 'phone', v_customer.phone, 'email', v_customer.email), now()
  )
  on conflict (customer_id) do update set
    business_id = excluded.business_id,
    summary = excluded.summary,
    conversation_count = excluded.conversation_count,
    order_count = excluded.order_count,
    delivered_order_count = excluded.delivered_order_count,
    lifetime_value_cop = excluded.lifetime_value_cop,
    last_order_code = excluded.last_order_code,
    last_order_status = excluded.last_order_status,
    last_order_total_cop = excluded.last_order_total_cop,
    last_order_items = excluded.last_order_items,
    frequent_products = excluded.frequent_products,
    last_payment_method = excluded.last_payment_method,
    first_seen_at = excluded.first_seen_at,
    last_interaction_at = excluded.last_interaction_at,
    facts = public.local2_customer_memory.facts || excluded.facts,
    updated_at = now();
end;
$$;

revoke all on function public.local2_refresh_customer_memory(uuid) from public;

create or replace function public.local2_history_from_order_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.local2_orders%rowtype;
  v_title text;
begin
  select * into v_order from public.local2_orders where id = new.order_id;
  if not found then return new; end if;

  v_title := case coalesce(new.status, new.event_type)
    when 'awaiting_payment' then 'Pedido creado'
    when 'payment_reported' then 'Pago reportado'
    when 'payment_confirmed' then 'Pago confirmado'
    when 'preparing' then 'Pedido en preparación'
    when 'ready' then 'Pedido listo'
    when 'delivered' then 'Pedido entregado'
    when 'cancelled' then 'Pedido cancelado'
    else coalesce(new.description, 'Actualización del pedido')
  end;

  insert into public.local2_customer_events (
    business_id, customer_id, event_type, title, description, source_type, source_id, metadata, occurred_at
  ) values (
    v_order.business_id, v_order.customer_id, new.event_type, v_title, new.description,
    'order_event', new.id,
    jsonb_build_object('order_id', new.order_id, 'public_code', v_order.public_code, 'status', new.status, 'total_cop', v_order.total_cop),
    new.created_at
  ) on conflict do nothing;

  perform public.local2_refresh_customer_memory(v_order.customer_id);
  return new;
end;
$$;

create or replace function public.local2_history_from_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.customer_id is not null and (tg_op = 'INSERT' or old.customer_id is distinct from new.customer_id) then
    insert into public.local2_customer_events (
      business_id, customer_id, event_type, title, description, source_type, source_id, occurred_at
    ) values (
      new.business_id, new.customer_id, 'conversation_started', 'Conversación con el asistente',
      'El cliente inició o recuperó una conversación con el Empleado Digital.',
      'conversation', new.id, coalesce(new.created_at, now())
    ) on conflict do nothing;
    perform public.local2_refresh_customer_memory(new.customer_id);
  end if;
  return new;
end;
$$;

create or replace function public.local2_refresh_memory_from_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.local2_refresh_customer_memory(coalesce(new.customer_id, old.customer_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.local2_refresh_memory_from_order_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_customer_id uuid;
begin
  select customer_id into v_customer_id from public.local2_orders where id = coalesce(new.order_id, old.order_id);
  if v_customer_id is not null then perform public.local2_refresh_customer_memory(v_customer_id); end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.local2_refresh_memory_from_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_customer_id uuid;
begin
  select o.customer_id into v_customer_id from public.local2_orders o where o.id = coalesce(new.order_id, old.order_id);
  if v_customer_id is not null then perform public.local2_refresh_customer_memory(v_customer_id); end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists local2_customer_history_order_event_trg on public.local2_order_events;
create trigger local2_customer_history_order_event_trg after insert on public.local2_order_events
for each row execute function public.local2_history_from_order_event();

drop trigger if exists local2_customer_history_conversation_trg on public.local2_conversations;
create trigger local2_customer_history_conversation_trg after insert or update of customer_id on public.local2_conversations
for each row execute function public.local2_history_from_conversation();

drop trigger if exists local2_customer_memory_order_trg on public.local2_orders;
create trigger local2_customer_memory_order_trg after insert or update on public.local2_orders
for each row execute function public.local2_refresh_memory_from_order();

drop trigger if exists local2_customer_memory_item_trg on public.local2_order_items;
create trigger local2_customer_memory_item_trg after insert or update or delete on public.local2_order_items
for each row execute function public.local2_refresh_memory_from_order_item();

drop trigger if exists local2_customer_memory_payment_trg on public.local2_payments;
create trigger local2_customer_memory_payment_trg after insert or update on public.local2_payments
for each row execute function public.local2_refresh_memory_from_payment();

insert into public.local2_customer_events (business_id, customer_id, event_type, title, description, source_type, source_id, occurred_at)
select c.business_id, c.id, 'customer_created', 'Cliente registrado', 'El cliente fue registrado en Local.', 'customer', c.id, c.created_at
from public.local2_customers c
on conflict do nothing;

insert into public.local2_customer_events (business_id, customer_id, event_type, title, description, source_type, source_id, occurred_at)
select conv.business_id, conv.customer_id, 'conversation_started', 'Conversación con el asistente',
       'El cliente inició o recuperó una conversación con el Empleado Digital.', 'conversation', conv.id, conv.created_at
from public.local2_conversations conv
where conv.customer_id is not null
on conflict do nothing;

insert into public.local2_customer_events (business_id, customer_id, event_type, title, description, source_type, source_id, metadata, occurred_at)
select o.business_id, o.customer_id, oe.event_type,
       case coalesce(oe.status, oe.event_type)
         when 'awaiting_payment' then 'Pedido creado'
         when 'payment_reported' then 'Pago reportado'
         when 'payment_confirmed' then 'Pago confirmado'
         when 'preparing' then 'Pedido en preparación'
         when 'ready' then 'Pedido listo'
         when 'delivered' then 'Pedido entregado'
         when 'cancelled' then 'Pedido cancelado'
         else coalesce(oe.description, 'Actualización del pedido')
       end,
       oe.description, 'order_event', oe.id,
       jsonb_build_object('order_id', oe.order_id, 'public_code', o.public_code, 'status', oe.status, 'total_cop', o.total_cop),
       oe.created_at
from public.local2_order_events oe
join public.local2_orders o on o.id = oe.order_id
on conflict do nothing;

do $$ declare r record; begin
  for r in select id from public.local2_customers loop
    perform public.local2_refresh_customer_memory(r.id);
  end loop;
end $$;