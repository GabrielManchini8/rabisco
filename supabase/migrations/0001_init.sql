-- Metadados (leves, consultáveis) separados do conteúdo CRDT (binário).
create table public.documents (
  id          text primary key,
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null default 'Sem título',
  kind        text not null check (kind in ('note','board')),
  tags        text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Log append-only de updates Yjs (base64). Compactado periodicamente.
create table public.doc_updates (
  id           bigint generated always as identity primary key,
  document_id  text not null references public.documents on delete cascade,
  owner_id     uuid not null default auth.uid(),
  update       text not null,
  created_at   timestamptz not null default now()
);
create index on public.doc_updates (document_id, id);

-- Snapshot compactado: Y.encodeStateAsUpdate(doc) do estado inteiro.
create table public.doc_snapshots (
  document_id  text primary key references public.documents on delete cascade,
  owner_id     uuid not null default auth.uid(),
  state        text not null,
  last_update_id bigint not null,
  created_at   timestamptz not null default now()
);

-- Arquivos (PDFs, imagens) vão para o Storage, bucket privado 'assets/<uid>/...'
insert into storage.buckets (id, name, public) values ('assets','assets', false) on conflict do nothing;

alter table public.documents     enable row level security;
alter table public.doc_updates   enable row level security;
alter table public.doc_snapshots enable row level security;
create policy own_docs  on public.documents     for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_upd   on public.doc_updates   for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_snap  on public.doc_snapshots for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_assets on storage.objects for all
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.doc_updates;
