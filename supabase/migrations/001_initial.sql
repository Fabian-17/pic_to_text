-- ============================================================
-- Migración inicial: EscánerRecibos
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- ── 1. Tabla de perfiles (extiende auth.users) ──────────────
create table if not exists public.profiles (
  id        uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  created_at timestamptz default now() not null
);

-- ── 2. Tabla de recibos ──────────────────────────────────────
create table if not exists public.receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  image_url       text not null,
  extracted_text  text,
  quality_score   float,
  quality_issues  text[],
  status          text not null default 'processing'
                    check (status in ('processing', 'done', 'failed')),
  created_at      timestamptz default now() not null,

  -- Columna generada para búsqueda full-text en español
  search_vector   tsvector generated always as (
    to_tsvector('spanish', coalesce(extracted_text, ''))
  ) stored
);

-- ── 3. Índices ────────────────────────────────────────────────
-- Índice GIN para búsqueda full-text rápida
create index if not exists receipts_search_vector_idx
  on public.receipts using gin(search_vector);

-- Índice para listar recibos por usuario ordenados por fecha
create index if not exists receipts_user_created_idx
  on public.receipts(user_id, created_at desc);

-- ── 4. Row Level Security (RLS) ──────────────────────────────
-- Cada usuario SOLO ve y modifica sus propios datos

alter table public.profiles enable row level security;
alter table public.receipts  enable row level security;

-- Profiles
create policy "Perfil: ver propio"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Perfil: actualizar propio"
  on public.profiles for update
  using (auth.uid() = id);

-- Receipts
create policy "Recibo: ver propios"
  on public.receipts for select
  using (auth.uid() = user_id);

create policy "Recibo: insertar propios"
  on public.receipts for insert
  with check (auth.uid() = user_id);

create policy "Recibo: actualizar propios"
  on public.receipts for update
  using (auth.uid() = user_id);

create policy "Recibo: eliminar propios"
  on public.receipts for delete
  using (auth.uid() = user_id);

-- ── 5. Trigger: crear perfil al registrarse ──────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 6. Storage bucket para imágenes ──────────────────────────
-- Ejecuta esto también (o créalo desde el dashboard de Supabase → Storage)
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Política: cada usuario solo puede subir/ver sus archivos (path: {user_id}/...)
create policy "Storage: subir propios"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Storage: ver propios"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Storage: eliminar propios"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );
