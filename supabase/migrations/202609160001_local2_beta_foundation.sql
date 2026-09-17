-- Local 2.0 Beta
-- Foundation tables are additive and isolated from the current Local production flow.
-- Existing businesses, membership lifecycle and current public pages are not modified.

create table if not exists public.local2_business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  slug text unique,
  assistant_enabled boolean not null default false,
  assistant_name text not null default 'Asistente',
  assistant_role text not null default 'Empleado Digital',
  welcome_message text,
  business_mode text not null default 'mixed' check (business_mode in ('products','services','mixed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_assistant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  provider text not null default 'mercadopago',
  provider_subscription_id text unique,
  status text not null default 'trial' check (status in ('trial','active','past_due','paused','cancelled')),
  amount_cop numeric(12,2),
  trial_ends_at timestamptz,
  last_payment_date timestamptz,
  next_payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  price_cop numeric(12,2) check (price_cop is null or price_cop >= 0),
  image_url text,
  active boolean not null default true,
  track_stock boolean not null default false,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  price_cop numeric(12,2) check (price_cop is null or price_cop >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  method_type text not null check (method_type in ('nequi','breb','daviplata','bank_transfer','cash','other')),
  label text,
  account_holder text,
  destination text,
  qr_url text,
  instructions text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.local2_customers(id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '90 days'),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.local2_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid not null references public.local2_customer_sessions(id) on delete cascade,
  customer_id uuid references public.local2_customers(id) on delete set null,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null references public.local2_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.local2_generate_order_code()
returns text
language sql
volatile
set search_path = public
as $$
  select 'L-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

create table if not exists public.local2_orders (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique default public.local2_generate_order_code(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.local2_customers(id) on delete restrict,
  conversation_id uuid references public.local2_conversations(id) on delete set null,
  status text not null default 'new' check (status in ('new','awaiting_payment','payment_reported','payment_confirmed','preparing','ready','delivered','cancelled')),
  subtotal_cop numeric(12,2) not null default 0 check (subtotal_cop >= 0),
  total_cop numeric(12,2) not null default 0 check (total_cop >= 0),
  currency text not null default 'COP',
  notes text,
  delivery_method text,
  delivery_details jsonb not null default '{}'::jsonb,
  estimated_ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.local2_orders(id) on delete cascade,
  product_id uuid references public.local2_products(id) on delete set null,
  service_id uuid references public.local2_services(id) on delete set null,
  name_snapshot text not null,
  unit_price_cop numeric(12,2) not null check (unit_price_cop >= 0),
  quantity integer not null default 1 check (quantity > 0),
  subtotal_cop numeric(12,2) not null check (subtotal_cop >= 0),
  created_at timestamptz not null default now(),
  check (product_id is not null or service_id is not null)
);

create table if not exists public.local2_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.local2_orders(id) on delete cascade,
  payment_method_id uuid references public.local2_payment_methods(id) on delete set null,
  method_type text,
  amount_cop numeric(12,2) not null check (amount_cop >= 0),
  status text not null default 'reported' check (status in ('reported','confirmed','rejected')),
  payer_name text,
  proof_url text,
  reported_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local2_order_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.local2_orders(id) on delete cascade,
  event_type text not null,
  status text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists local2_products_business_idx on public.local2_products(business_id, active, sort_order);
create index if not exists local2_services_business_idx on public.local2_services(business_id, active, sort_order);
create index if not exists local2_payment_methods_business_idx on public.local2_payment_methods(business_id, active, sort_order);
create index if not exists local2_customers_business_idx on public.local2_customers(business_id, created_at desc);
create index if not exists local2_sessions_business_idx on public.local2_customer_sessions(business_id, last_seen_at desc);
create index if not exists local2_conversations_business_idx on public.local2_conversations(business_id, updated_at desc);
create index if not exists local2_messages_conversation_idx on public.local2_messages(conversation_id, created_at);
create index if not exists local2_orders_business_idx on public.local2_orders(business_id, created_at desc);
create index if not exists local2_orders_customer_idx on public.local2_orders(customer_id, created_at desc);
create index if not exists local2_payments_business_idx on public.local2_payments(business_id, status, reported_at desc);
create index if not exists local2_order_events_order_idx on public.local2_order_events(order_id, created_at);

create or replace function public.local2_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'local2_business_settings','local2_assistant_subscriptions','local2_products','local2_services',
    'local2_payment_methods','local2_customers','local2_conversations','local2_orders','local2_payments'
  ] LOOP
    EXECUTE format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    EXECUTE format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.local2_set_updated_at()', t, t);
  END LOOP;
END $$;

alter table public.local2_business_settings enable row level security;
alter table public.local2_assistant_subscriptions enable row level security;
alter table public.local2_products enable row level security;
alter table public.local2_services enable row level security;
alter table public.local2_payment_methods enable row level security;
alter table public.local2_customers enable row level security;
alter table public.local2_customer_sessions enable row level security;
alter table public.local2_conversations enable row level security;
alter table public.local2_messages enable row level security;
alter table public.local2_orders enable row level security;
alter table public.local2_order_items enable row level security;
alter table public.local2_payments enable row level security;
alter table public.local2_order_events enable row level security;

-- Owner access. Public customer flows go through a server-side Edge Function.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'local2_business_settings','local2_assistant_subscriptions','local2_products','local2_services',
    'local2_payment_methods','local2_customers','local2_customer_sessions','local2_conversations',
    'local2_messages','local2_orders','local2_order_items','local2_payments','local2_order_events'
  ] LOOP
    EXECUTE format('drop policy if exists "Local2 owners manage %s" on public.%I', t, t);
    EXECUTE format(
      'create policy "Local2 owners manage %s" on public.%I for all to authenticated using (exists (select 1 from public.businesses b where b.id = %I.business_id and b.owner_id = (select auth.uid()))) with check (exists (select 1 from public.businesses b where b.id = %I.business_id and b.owner_id = (select auth.uid())))',
      t, t, t, t
    );
  END LOOP;
END $$;

-- Limited public catalog reads only. No customer, conversation, order or payment data is exposed directly.
drop policy if exists "Local2 public settings" on public.local2_business_settings;
create policy "Local2 public settings"
on public.local2_business_settings
for select
to anon
using (
  exists (
    select 1 from public.businesses b
    where b.id = local2_business_settings.business_id
      and b.status = 'active'
  )
);

drop policy if exists "Local2 public products" on public.local2_products;
create policy "Local2 public products"
on public.local2_products
for select
to anon
using (
  active and exists (
    select 1 from public.businesses b
    where b.id = local2_products.business_id
      and b.status = 'active'
  )
);

drop policy if exists "Local2 public services" on public.local2_services;
create policy "Local2 public services"
on public.local2_services
for select
to anon
using (
  active and exists (
    select 1 from public.businesses b
    where b.id = local2_services.business_id
      and b.status = 'active'
  )
);

drop policy if exists "Local2 public payment methods" on public.local2_payment_methods;
create policy "Local2 public payment methods"
on public.local2_payment_methods
for select
to anon
using (
  active and exists (
    select 1 from public.businesses b
    where b.id = local2_payment_methods.business_id
      and b.status = 'active'
  )
);

create or replace function public.local2_confirm_payment(p_payment_id uuid)
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
grant execute on function public.local2_confirm_payment(uuid) to authenticated;

create or replace function public.local2_set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
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
grant execute on function public.local2_set_order_status(uuid, text) to authenticated;
