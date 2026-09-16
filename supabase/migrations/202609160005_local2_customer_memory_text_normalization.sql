create or replace function public.local2_normalize_customer_memory_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.summary is not null then
    new.summary := replace(new.summary, ' conversaciónes', ' conversaciones');
  end if;
  return new;
end;
$$;

drop trigger if exists local2_customer_memory_text_trg on public.local2_customer_memory;
create trigger local2_customer_memory_text_trg
before insert or update of summary on public.local2_customer_memory
for each row execute function public.local2_normalize_customer_memory_text();

update public.local2_customer_memory
set summary = replace(summary, ' conversaciónes', ' conversaciones')
where summary like '% conversaciónes%';
