drop policy if exists "Local2 owners select product images" on storage.objects;
drop policy if exists "Local2 owners insert product images" on storage.objects;
drop policy if exists "Local2 owners update product images" on storage.objects;
drop policy if exists "Local2 owners delete product images" on storage.objects;

create policy "Local2 owners select product images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and b.owner_id = (select auth.uid())
  )
);

create policy "Local2 owners insert product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and b.owner_id = (select auth.uid())
  )
);

create policy "Local2 owners update product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and b.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and b.owner_id = (select auth.uid())
  )
);

create policy "Local2 owners delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(storage.objects.name))[1]
      and b.owner_id = (select auth.uid())
  )
);
