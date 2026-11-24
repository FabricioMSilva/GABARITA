create or replace function public.create_course_draft(
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
  v_course_status text;
  v_subject jsonb;
  v_lesson jsonb;
  v_subject_name text;
  v_materia_id uuid;
  v_subject_order integer := 0;
  v_lesson_order integer;
begin
  if coalesce(jsonb_typeof(p_materias), '') <> 'array' then
    raise exception 'Course subjects must be an array';
  end if;
  if jsonb_array_length(p_materias) = 0
    or jsonb_array_length(p_materias) > 30 then
    raise exception 'Course must contain between 1 and 30 subjects';
  end if;

  select * into v_job
  from public.fila_geracao
  where id = p_queue_id
  for update;

  if not found or v_job.status <> 'processing' then
    raise exception 'Generation queue item is not being processed';
  end if;

  select id, status into v_course_id, v_course_status
  from public.cursos
  where concurso_key = v_job.concurso_key
    and profissao_key = v_job.profissao_key
  for update;

  if found then
    if v_course_status = 'ready' then
      raise exception 'A published course already exists for this request';
    end if;

    update public.cursos
    set titulo = p_titulo,
        descricao = p_descricao,
        edital_url = p_edital_url,
        status = 'draft',
        updated_at = now()
    where id = v_course_id;
  else
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
      'draft'
    )
    returning id into v_course_id;
  end if;

  delete from public.materias where curso_id = v_course_id;

  for v_subject in
    select value from jsonb_array_elements(p_materias) as items(value)
  loop
    v_subject_name := nullif(trim(v_subject->>'name'), '');
    if v_subject_name is null then
      raise exception 'Each subject requires a name';
    end if;
    if coalesce(jsonb_typeof(v_subject->'lessons'), '') <> 'array' then
      raise exception 'Each subject requires a lessons array';
    end if;
    if jsonb_array_length(v_subject->'lessons') = 0
      or jsonb_array_length(v_subject->'lessons') > 10 then
      raise exception 'Each subject requires between 1 and 10 lessons';
    end if;

    v_subject_order := v_subject_order + 1;
    insert into public.materias (curso_id, nome, ordem)
    values (v_course_id, v_subject_name, v_subject_order)
    returning id into v_materia_id;

    v_lesson_order := 0;
    for v_lesson in
      select value
      from jsonb_array_elements(v_subject->'lessons') as lessons(value)
    loop
      if nullif(trim(v_lesson->>'title'), '') is null
        or nullif(trim(v_lesson->>'content'), '') is null then
        raise exception 'Each lesson requires a title and content';
      end if;

      v_lesson_order := v_lesson_order + 1;
      insert into public.aulas (materia_id, titulo, conteudo, ordem)
      values (
        v_materia_id,
        trim(v_lesson->>'title'),
        trim(v_lesson->>'content'),
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
    'curso_para_revisao',
    jsonb_build_object('curso_id', v_course_id)
  )
  on conflict (fila_geracao_id, tipo) do nothing;

  return v_course_id;
end;
$$;

create or replace function public.review_course_draft(
  p_curso_id uuid,
  p_titulo text,
  p_descricao text,
  p_materias jsonb,
  p_aprovar boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course public.cursos%rowtype;
  v_subject jsonb;
  v_lesson jsonb;
  v_subject_name text;
  v_materia_id uuid;
  v_subject_order integer := 0;
  v_lesson_order integer;
  v_queue_id uuid;
begin
  if coalesce(jsonb_typeof(p_materias), '') <> 'array' then
    raise exception 'Course subjects must be an array';
  end if;
  if jsonb_array_length(p_materias) = 0
    or jsonb_array_length(p_materias) > 30 then
    raise exception 'Course must contain between 1 and 30 subjects';
  end if;

  select * into v_course
  from public.cursos
  where id = p_curso_id
  for update;

  if not found or v_course.status <> 'draft' then
    raise exception 'Only draft courses can be reviewed';
  end if;

  update public.cursos
  set titulo = p_titulo,
      descricao = p_descricao,
      status = case when p_aprovar then 'ready' else 'draft' end,
      updated_at = now()
  where id = p_curso_id;

  delete from public.materias where curso_id = p_curso_id;

  for v_subject in
    select value from jsonb_array_elements(p_materias) as items(value)
  loop
    v_subject_name := nullif(trim(v_subject->>'name'), '');
    if v_subject_name is null then
      raise exception 'Each subject requires a name';
    end if;
    if coalesce(jsonb_typeof(v_subject->'lessons'), '') <> 'array' then
      raise exception 'Each subject requires a lessons array';
    end if;
    if jsonb_array_length(v_subject->'lessons') = 0
      or jsonb_array_length(v_subject->'lessons') > 10 then
      raise exception 'Each subject requires between 1 and 10 lessons';
    end if;

    v_subject_order := v_subject_order + 1;
    insert into public.materias (curso_id, nome, ordem)
    values (p_curso_id, v_subject_name, v_subject_order)
    returning id into v_materia_id;

    v_lesson_order := 0;
    for v_lesson in
      select value from jsonb_array_elements(v_subject->'lessons') as lessons(value)
    loop
      if nullif(trim(v_lesson->>'title'), '') is null
        or nullif(trim(v_lesson->>'content'), '') is null then
        raise exception 'Each lesson requires a title and content';
      end if;

      v_lesson_order := v_lesson_order + 1;
      insert into public.aulas (materia_id, titulo, conteudo, ordem)
      values (
        v_materia_id,
        trim(v_lesson->>'title'),
        trim(v_lesson->>'content'),
        v_lesson_order
      );
    end loop;
  end loop;

  if p_aprovar then
    select id into v_queue_id
    from public.fila_geracao
    where curso_id = p_curso_id
    order by completed_at desc nulls last
    limit 1;

    if v_queue_id is not null then
      insert into public.notificacoes (fila_geracao_id, tipo, payload)
      values (
        v_queue_id,
        'curso_pronto',
        jsonb_build_object('curso_id', p_curso_id)
      )
      on conflict (fila_geracao_id, tipo) do nothing;
    end if;
  end if;

  return p_curso_id;
end;
$$;

revoke all on function public.create_course_draft(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.review_course_draft(uuid, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.create_course_draft(uuid, text, text, text, jsonb)
  to service_role;
grant execute on function public.review_course_draft(uuid, text, text, jsonb, boolean)
  to service_role;
