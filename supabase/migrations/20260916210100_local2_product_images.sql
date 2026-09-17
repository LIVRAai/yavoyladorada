insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'local2-product-images',
  'local2-product-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Local2 owners insert product images" on storage.objects;
create policy "Local2 owners insert product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "Local2 owners select product images" on storage.objects;
create policy "Local2 owners select product images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "Local2 owners update product images" on storage.objects;
create policy "Local2 owners update product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "Local2 owners delete product images" on storage.objects;
create policy "Local2 owners delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'local2-product-images'
  and exists (
    select 1
    from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_id = (select auth.uid())
  )
);
