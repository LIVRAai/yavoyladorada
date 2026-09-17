-- Cover Local 2.0 foreign keys used by session, order and payment flows.
create index if not exists local2_conversations_customer_idx on public.local2_conversations(customer_id);
create index if not exists local2_conversations_session_idx on public.local2_conversations(session_id);
create index if not exists local2_customer_sessions_customer_idx on public.local2_customer_sessions(customer_id);
create index if not exists local2_messages_business_idx on public.local2_messages(business_id);
create index if not exists local2_order_events_business_idx on public.local2_order_events(business_id);
create index if not exists local2_order_items_business_idx on public.local2_order_items(business_id);
create index if not exists local2_order_items_order_idx on public.local2_order_items(order_id);
create index if not exists local2_order_items_product_idx on public.local2_order_items(product_id) where product_id is not null;
create index if not exists local2_order_items_service_idx on public.local2_order_items(service_id) where service_id is not null;
create index if not exists local2_orders_conversation_idx on public.local2_orders(conversation_id) where conversation_id is not null;
create index if not exists local2_payments_confirmed_by_idx on public.local2_payments(confirmed_by) where confirmed_by is not null;
create index if not exists local2_payments_order_idx on public.local2_payments(order_id);
create index if not exists local2_payments_method_idx on public.local2_payments(payment_method_id) where payment_method_id is not null;
