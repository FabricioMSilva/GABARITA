# Gerador autônomo de cursos para concursos

Aplicação Next.js 15, TypeScript, Tailwind CSS e Supabase. O pipeline monitora feeds RSS/Atom, registra novos editais, extrai texto de PDFs e monta rascunhos de cursos usando regras e modelos fixos.

## Pipeline

1. `/api/gerar` retorna um curso pronto ou adiciona uma solicitação a `fila_geracao`.
2. O Vercel Cron chama `/api/cron/pipeline`, protegido por `CRON_SECRET`.
3. `ConcursoMonitorService` consulta os feeds RSS/Atom ativos e registra itens novos.
4. `EditalProcessorService` baixa PDFs, extrai texto e identifica matérias.
5. `CursoGeneratorService` cria cinco aulas-modelo por matéria detectada e salva o curso como rascunho.
6. O administrador acessa `/admin`, revisa e edita o material e só então aprova o curso para disponibilização.
7. As mudanças de revisão são salvas no Supabase; o gerador por regras não aprende sozinho nem cria explicações, questões ou gabaritos verificados.

## Configuração

Defina estas variáveis no ambiente local e em **Vercel > Settings > Environment Variables**:

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave publicável do Supabase usada pelo formulário de login administrativo.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta Supabase, somente no servidor.
- `SUPABASE_PROJECT_REF`: identificador do projeto usado pela CLI.
- `CRON_SECRET`: segredo aleatório enviado pela Vercel no header `Authorization: Bearer`.
- `ADMIN_EMAIL`: e-mail exato da conta Supabase Auth autorizada a revisar cursos.
- O gerador usa modelos fixos e regras locais; não exige chave de API de IA. O administrador deve conferir cada material com o edital e fontes oficiais.

Não publique chaves secretas no repositório nem use prefixo `NEXT_PUBLIC_` para segredos.

## Monitorar um concurso

O projeto não inclui feeds pré-configurados: cada fonte e concurso a monitorar precisa ser cadastrado no banco. Use um feed RSS ou Atom público com HTTPS:

```sql
insert into public.concursos_monitorados
  (nome, profissao, feed_url, palavras_chave)
values
  (
    'Transpetro',
    'Enfermagem',
    'https://exemplo.gov.br/concursos/feed.xml',
    array['Transpetro', 'Enfermagem', 'edital']
  );
```

Uma linha representa um par concurso/profissão e uma fonte. O monitor evita duplicatas e limita o processamento por execução. Configure fontes que você tem autorização para consultar.

## Vercel Cron

`vercel.json` agenda `/api/cron/pipeline` diariamente às 09:00 UTC, compatível com Vercel Hobby. Hobby limita Cron Jobs a uma execução por dia e pode atrasá-la em até 59 minutos. Para monitoramento mais frequente, use um plano que permita intervalos menores e ajuste a expressão cron.

Os Cron Jobs só são ativados em deployments de produção. Configure `CRON_SECRET` no ambiente **Production** e faça um novo deploy após alterar esse segredo. A rota usa duração máxima de 300 segundos e processa lotes limitados para permitir retomada na execução seguinte.

Para a área administrativa, crie um usuário de autenticação no Supabase e configure `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `ADMIN_EMAIL` na Vercel. Em Supabase Auth > URL Configuration, use `https://gabarita-theta.vercel.app` como Site URL e permita `https://gabarita-theta.vercel.app/**` como Redirect URL. No login em `/admin`, use “Esqueci minha senha” para receber um link seguro e definir a senha. A API valida o token do Supabase Auth e permite revisão apenas ao e-mail configurado. Cursos em rascunho não são retornados como cursos disponíveis; eles só passam a `ready` após aprovação.

## Desenvolvimento

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Para criar ou atualizar o schema remoto, autentique e vincule a CLI:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npm run db:push
```

As migrations ficam em `supabase/migrations`. O processamento de PDF escaneado/OCR e o envio de notificações por e-mail não estão configurados; `notificacoes` guarda eventos até que um canal de entrega seja integrado.

## Estrutura principal

- `src/lib/types`: tipos do banco e do pipeline.
- `src/lib/repositories`: acesso tipado ao Supabase.
- `src/lib/services`: monitoramento, processamento de edital, geração por regras e autorização administrativa.
- `src/app/admin`: revisão e aprovação manual de cursos.
- `src/app/api/cron/pipeline`: worker acionado pela Vercel.
- `supabase/migrations`: schema e funções de claim/publicação atômica.
