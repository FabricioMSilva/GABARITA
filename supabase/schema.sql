create extension if not exists pgcrypto;

create or replace function public.normalizar_chave_busca(valor text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(valor), '\s+', ' ', 'g'));
$$;

create table if not exists public.cursos (
  id uuid primary key default gen_random_uuid(),
  concurso text not null,
  profissao text not null,
  concurso_key text not null,
  profissao_key text not null,
  titulo text not null,
  descricao text,
  edital_url text,
  status text not null default 'ready'
    check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.definir_chaves_curso()
returns trigger
language plpgsql
as $$
begin
  new.concurso_key := public.normalizar_chave_busca(new.concurso);
  new.profissao_key := public.normalizar_chave_busca(new.profissao);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cursos_definir_chaves on public.cursos;
create trigger cursos_definir_chaves
before insert or update of concurso, profissao on public.cursos
for each row execute function public.definir_chaves_curso();

create unique index if not exists cursos_concurso_profissao_key
  on public.cursos (concurso_key, profissao_key);
create index if not exists cursos_status_idx on public.cursos (status);

create table if not exists public.fila_geracao (
  id uuid primary key default gen_random_uuid(),
  concurso text not null,
  profissao text not null,
  concurso_key text not null,
  profissao_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  curso_id uuid references public.cursos (id) on delete set null,
  erro text,
  tentativas integer not null default 0 check (tentativas >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create or replace function public.definir_chaves_fila_geracao()
returns trigger
language plpgsql
as $$
begin
  new.concurso_key := public.normalizar_chave_busca(new.concurso);
  new.profissao_key := public.normalizar_chave_busca(new.profissao);
  return new;
end;
$$;

drop trigger if exists fila_geracao_definir_chaves on public.fila_geracao;
create trigger fila_geracao_definir_chaves
before insert or update of concurso, profissao on public.fila_geracao
for each row execute function public.definir_chaves_fila_geracao();

create unique index if not exists fila_geracao_ativa_unica
  on public.fila_geracao (concurso_key, profissao_key)
  where status in ('queued', 'processing');
create index if not exists fila_geracao_status_created_idx
  on public.fila_geracao (status, created_at);

create table if not exists public.materias (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos (id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  unique (curso_id, nome)
);

create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references public.materias (id) on delete cascade,
  titulo text not null,
  conteudo text,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cursos enable row level security;
alter table public.fila_geracao enable row level security;
alter table public.materias enable row level security;
alter table public.aulas enable row level security;
