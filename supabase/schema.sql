create extension if not exists pgcrypto;

-- 1. Store Administrators Table
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. Products Table
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  brand text not null check (length(trim(brand)) between 1 and 80),
  category text not null check (category in ('Makeup', 'Skincare', 'Haircare', 'Nail Care', 'Beauty Accessories', 'Bangles', 'Fragrance', 'Women’s Care', 'Women''s Care')),
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

-- 3. Customer Profiles Table
create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  pincode text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Customer Orders Table
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null check (length(trim(customer_phone)) >= 10),
  customer_address text not null check (length(trim(customer_address)) > 0),
  customer_city text not null default '',
  customer_pincode text not null default '',
  order_notes text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Secure Function to Check Store Owner / Admin Status
create or replace function public.is_store_admin(candidate uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    exists (select 1 from public.admin_users where user_id = candidate)
    or exists (
      select 1 from auth.users 
      where id = candidate and lower(trim(email)) = 'akanksha101108@gmail.com'
    )
  );
$$;

revoke all on function public.is_store_admin(uuid) from public;
grant execute on function public.is_store_admin(uuid) to anon, authenticated;

-- Grants
grant select on public.admin_users to authenticated;
grant select, insert, update, delete on public.products to anon, authenticated;
grant select, insert, update on public.customer_profiles to authenticated;
grant select, insert on public.orders to anon, authenticated;
grant update, delete on public.orders to authenticated;

-- Enable Row Level Security on all tables
alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.orders enable row level security;

-- Admin users policies
create policy "Admins can read their own membership"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

-- Products policies
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

-- Customer profiles policies (strict privacy: users can only see and update their own profile)
create policy "Customers can read their own profile"
on public.customer_profiles for select to authenticated
using (id = auth.uid());

create policy "Customers can insert their own profile"
on public.customer_profiles for insert to authenticated
with check (id = auth.uid());

create policy "Customers can update their own profile"
on public.customer_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Orders policies (strict privacy: customers can only view their own orders; admins can view & manage all orders)
create policy "Customers can read their own orders or admins read all"
on public.orders for select to authenticated
using (user_id = auth.uid() or public.is_store_admin(auth.uid()));

create policy "Anyone can create an order"
on public.orders for insert to anon, authenticated
with check (
  (auth.uid() is null and user_id is null) or
  (auth.uid() is not null and (user_id = auth.uid() or user_id is null))
);

create policy "Admins can update orders"
on public.orders for update to authenticated
using (public.is_store_admin(auth.uid()))
with check (public.is_store_admin(auth.uid()));

create policy "Admins can delete orders"
on public.orders for delete to authenticated
using (public.is_store_admin(auth.uid()));

-- Storage configuration
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

-- Auto-enroll akanksha101108@gmail.com into admin_users if already present in auth.users
insert into public.admin_users (user_id)
select id from auth.users where lower(trim(email)) = 'akanksha101108@gmail.com'
on conflict (user_id) do nothing;
