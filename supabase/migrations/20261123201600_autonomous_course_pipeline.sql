alter table public.fila_geracao
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_until timestamptz,
  add column if not exists last_error text;

create index if not exists fila_geracao_due_idx
  on public.fila_geracao (status, next_attempt_at, created_at);

create table if not exists public.concursos_monitorados (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  profissao text not null,
  concurso_key text not null,
  profissao_key text not null,
  feed_url text not null check (feed_url ~ '^https://'),
  palavras_chave text[] not null default '{}',
  ativo boolean not null default true,
  intervalo_minutos integer not null default 1440
    check (intervalo_minutos between 15 and 10080),
  ultima_verificacao timestamptz,
  proxima_verificacao timestamptz not null default now(),
  locked_until timestamptz,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feed_url, concurso_key, profissao_key)
);

create or replace function public.definir_chaves_concurso_monitorado()
returns trigger
language plpgsql
as $$
begin
  new.concurso_key := public.normalizar_chave_busca(new.nome);
  new.profissao_key := public.normalizar_chave_busca(new.profissao);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists concursos_monitorados_definir_chaves
  on public.concursos_monitorados;
create trigger concursos_monitorados_definir_chaves
before insert or update of nome, profissao on public.concursos_monitorados
for each row execute function public.definir_chaves_concurso_monitorado();

create index if not exists concursos_monitorados_due_idx
  on public.concursos_monitorados (ativo, proxima_verificacao, locked_until);

create table if not exists public.editais_encontrados (
  id uuid primary key default gen_random_uuid(),
  concurso_id uuid not null
    references public.concursos_monitorados (id) on delete cascade,
  external_id text not null,
  fingerprint text not null,
  titulo text not null,
  source_url text not null,
  edital_url text,
  publicado_em timestamptz,
  resumo text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  unique (concurso_id, fingerprint)
);

create index if not exists editais_encontrados_concurso_data_idx
  on public.editais_encontrados (concurso_id, publicado_em desc);
create index if not exists editais_encontrados_status_idx
  on public.editais_encontrados (status, created_at);

create table if not exists public.processamento_editais (
  id uuid primary key default gen_random_uuid(),
  edital_id uuid not null unique
    references public.editais_encontrados (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  tentativas integer not null default 0 check (tentativas >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  texto_extraido text,
  materias jsonb not null default '[]'::jsonb
    check (jsonb_typeof(materias) = 'array'),
  ultimo_erro text,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists processamento_editais_due_idx
  on public.processamento_editais (status, next_attempt_at, locked_until);

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  fila_geracao_id uuid references public.fila_geracao (id) on delete cascade,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  tentativas integer not null default 0 check (tentativas >= 0),
  ultimo_erro text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (fila_geracao_id, tipo)
);

create index if not exists notificacoes_pending_idx
  on public.notificacoes (status, created_at);

create or replace function public.claim_due_concursos(p_limit integer default 10)
returns setof public.concursos_monitorados
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id
    from public.concursos_monitorados
    where ativo
      and proxima_verificacao <= now()
      and (locked_until is null or locked_until < now())
    order by proxima_verificacao, created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.concursos_monitorados as monitor
  set locked_until = now() + interval '15 minutes',
      updated_at = now()
  from candidates
  where monitor.id = candidates.id
  returning monitor.*;
end;
$$;

create or replace function public.register_edital_found(
  p_concurso_id uuid,
  p_external_id text,
  p_fingerprint text,
  p_titulo text,
  p_source_url text,
  p_edital_url text,
  p_publicado_em timestamptz,
  p_resumo text
)
returns table (edital_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_edital_id uuid;
  v_created boolean;
begin
  insert into public.editais_encontrados (
    concurso_id,
    external_id,
    fingerprint,
    titulo,
    source_url,
    edital_url,
    publicado_em,
    resumo
  )
  values (
    p_concurso_id,
    p_external_id,
    p_fingerprint,
    p_titulo,
    p_source_url,
    p_edital_url,
    p_publicado_em,
    p_resumo
  )
  on conflict (concurso_id, fingerprint) do nothing
  returning id into v_edital_id;

  v_created := v_edital_id is not null;

  if not v_created then
    select id into v_edital_id
    from public.editais_encontrados
    where concurso_id = p_concurso_id
      and fingerprint = p_fingerprint;
  else
    insert into public.processamento_editais (edital_id)
    values (v_edital_id)
    on conflict (edital_id) do nothing;
  end if;

  if v_edital_id is null then
    raise exception 'Edital registration did not return an id';
  end if;

  return query select v_edital_id, v_created;
end;
$$;

create or replace function public.claim_pending_edital_jobs(p_limit integer default 2)
returns setof public.processamento_editais
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id
    from public.processamento_editais
    where (
      status = 'pending'
      and next_attempt_at <= now()
    ) or (
      status = 'processing'
      and locked_until < now()
    )
    order by next_attempt_at, created_at
    limit greatest(1, least(coalesce(p_limit, 2), 20))
    for update skip locked
  )
  update public.processamento_editais as job
  set status = 'processing',
      tentativas = job.tentativas + 1,
      locked_until = now() + interval '15 minutes',
      ultimo_erro = null,
      updated_at = now()
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

create or replace function public.claim_generation_jobs(p_limit integer default 1)
returns setof public.fila_geracao
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id
    from public.fila_geracao
    where (
      status = 'queued'
      and next_attempt_at <= now()
    ) or (
      status = 'processing'
      and locked_until < now()
    )
    order by next_attempt_at, created_at
    limit greatest(1, least(coalesce(p_limit, 1), 10))
    for update skip locked
  )
  update public.fila_geracao as job
  set status = 'processing',
      tentativas = job.tentativas + 1,
      started_at = coalesce(job.started_at, now()),
      locked_until = now() + interval '15 minutes',
      last_error = null
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

create or replace function public.link_existing_course(
  p_queue_id uuid,
  p_curso_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.fila_geracao
  set status = 'completed',
      curso_id = p_curso_id,
      completed_at = now(),
      locked_until = null,
      last_error = null
  where id = p_queue_id;

  insert into public.notificacoes (fila_geracao_id, tipo, payload)
  values (
    p_queue_id,
    'curso_pronto',
    jsonb_build_object('curso_id', p_curso_id)
  )
  on conflict (fila_geracao_id, tipo) do nothing;

  return p_curso_id;
end;
$$;

create or replace function public.publish_generated_course(
  p_queue_id uuid,
  p_titulo text,
  p_descricao text,
  p_edital_url text,
  p_materias jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.fila_geracao%rowtype;
  v_course_id uuid;
  v_subject jsonb;
  v_lesson jsonb;
  v_materia_id uuid;
  v_subject_order integer := 0;
  v_lesson_order integer;
begin
  if jsonb_typeof(p_materias) <> 'array'
    or jsonb_array_length(p_materias) = 0 then
    raise exception 'At least one course subject is required';
  end if;

  select * into v_job
  from public.fila_geracao
  where id = p_queue_id
  for update;

  if not found or v_job.status <> 'processing' then
    raise exception 'Generation queue item is not being processed';
  end if;

  insert into public.cursos (
    concurso,
    profissao,
    concurso_key,
    profissao_key,
    titulo,
    descricao,
    edital_url,
    status
  )
  values (
    v_job.concurso,
    v_job.profissao,
    v_job.concurso_key,
    v_job.profissao_key,
    p_titulo,
    p_descricao,
    p_edital_url,
    'ready'
  )
  on conflict (concurso_key, profissao_key)
  do update set
    titulo = excluded.titulo,
    descricao = excluded.descricao,
    edital_url = excluded.edital_url,
    status = 'ready',
    updated_at = now()
  returning id into v_course_id;

  delete from public.materias where curso_id = v_course_id;

  for v_subject in
    select value from jsonb_array_elements(p_materias) as items(value)
  loop
    v_subject_order := v_subject_order + 1;
    insert into public.materias (curso_id, nome, ordem)
    values (
      v_course_id,
      v_subject->>'name',
      v_subject_order
    )
    returning id into v_materia_id;

    v_lesson_order := 0;
    for v_lesson in
      select value
      from jsonb_array_elements(coalesce(v_subject->'lessons', '[]'::jsonb))
        as lessons(value)
    loop
      v_lesson_order := v_lesson_order + 1;
      insert into public.aulas (materia_id, titulo, conteudo, ordem)
      values (
        v_materia_id,
        v_lesson->>'title',
        v_lesson->>'content',
        v_lesson_order
      );
    end loop;
  end loop;

  update public.fila_geracao
  set status = 'completed',
      curso_id = v_course_id,
      completed_at = now(),
      locked_until = null,
      last_error = null
  where id = p_queue_id;

  insert into public.notificacoes (fila_geracao_id, tipo, payload)
  values (
    p_queue_id,
    'curso_pronto',
    jsonb_build_object('curso_id', v_course_id)
  )
  on conflict (fila_geracao_id, tipo) do nothing;

  return v_course_id;
end;
$$;

alter table public.concursos_monitorados enable row level security;
alter table public.editais_encontrados enable row level security;
alter table public.processamento_editais enable row level security;
alter table public.notificacoes enable row level security;

revoke all on public.concursos_monitorados from anon, authenticated;
revoke all on public.editais_encontrados from anon, authenticated;
revoke all on public.processamento_editais from anon, authenticated;
revoke all on public.notificacoes from anon, authenticated;
grant all on public.concursos_monitorados to service_role;
grant all on public.editais_encontrados to service_role;
grant all on public.processamento_editais to service_role;
grant all on public.notificacoes to service_role;

revoke all on function public.claim_due_concursos(integer) from public, anon, authenticated;
revoke all on function public.register_edital_found(uuid, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.claim_pending_edital_jobs(integer) from public, anon, authenticated;
revoke all on function public.claim_generation_jobs(integer) from public, anon, authenticated;
revoke all on function public.link_existing_course(uuid, uuid) from public, anon, authenticated;
revoke all on function public.publish_generated_course(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_due_concursos(integer) to service_role;
grant execute on function public.register_edital_found(uuid, text, text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.claim_pending_edital_jobs(integer) to service_role;
grant execute on function public.claim_generation_jobs(integer) to service_role;
grant execute on function public.link_existing_course(uuid, uuid) to service_role;
grant execute on function public.publish_generated_course(uuid, text, text, text, jsonb) to service_role;
