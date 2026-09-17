-- Local 2.0 Beta
-- The rejection RPC can run as the signed-in owner because the underlying tables already enforce owner RLS.

alter function public.local2_reject_payment(uuid) security invoker;
revoke all on function public.local2_reject_payment(uuid) from public, anon;
grant execute on function public.local2_reject_payment(uuid) to authenticated;
