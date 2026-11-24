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
    on conflict on constraint processamento_editais_edital_id_key do nothing;
  end if;

  if v_edital_id is null then
    raise exception 'Edital registration did not return an id';
  end if;

  return query select v_edital_id, v_created;
end;
$$;
