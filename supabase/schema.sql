create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  brand text not null check (length(trim(brand)) between 1 and 80),
  category text not null check (category in ('Makeup', 'Skincare', 'Haircare', 'Nail Care', 'Beauty Accessories', 'Bangles', 'Fragrance', 'Women’s Care')),
  price numeric(12, 2) not null check (price > 0),
  mrp numeric(12, 2) check (mrp is null or mrp > price),
  description text not null check (length(trim(description)) between 1 and 1000),
  image_path text not null,
  variants text[] not null default '{}',
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_store_admin(candidate uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = candidate);
$$;

revoke all on function public.is_store_admin(uuid) from public;
grant execute on function public.is_store_admin(uuid) to anon, authenticated;

grant select on public.admin_users to authenticated;
grant select, insert, update, delete on public.products to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;

create policy "Admins can read their own membership"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

create policy "Anyone can read published products"
on public.products for select to anon, authenticated
using (is_published or public.is_store_admin(auth.uid()));

create policy "Admins can add products"
on public.products for insert to authenticated
with check (public.is_store_admin(auth.uid()) and created_by = auth.uid());

create policy "Admins can update products"
on public.products for update to authenticated
using (public.is_store_admin(auth.uid()))
with check (public.is_store_admin(auth.uid()));

create policy "Admins can delete products"
on public.products for delete to authenticated
using (public.is_store_admin(auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view product images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');

create policy "Admins can upload product images under their folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_store_admin(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins can update product images under their folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and public.is_store_admin(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-images'
  and public.is_store_admin(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins can delete product images under their folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.is_store_admin(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- After creating the first admin user in Supabase Auth, add their Auth user UUID:
-- insert into public.admin_users (user_id) values ('PASTE-AUTH-USER-UUID-HERE');
