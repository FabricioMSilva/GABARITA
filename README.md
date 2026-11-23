# Gerador de cursos para concursos

MVP em Next.js 15, TypeScript, Tailwind CSS e Supabase. Nesta etapa, `/gerar` consulta cursos prontos e, quando não encontra um, registra a solicitação em `fila_geracao`. O processamento do edital e a criação de aulas ainda não estão implementados.

## Executar

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local` e preencha as credenciais do projeto Supabase. `SUPABASE_SERVICE_ROLE_KEY` é segredo de servidor e nunca deve ser exposta ao navegador.
3. Execute `supabase/schema.sql` no SQL Editor do Supabase.
4. Inicie o projeto com `npm run dev`.

## Estrutura

- `src/app/gerar`: formulário do gerador.
- `src/app/api/gerar`: endpoint para localizar curso ou enfileirar geração.
- `src/lib/queue`: serviço de acesso à fila e consulta de cursos.
- `src/lib/supabase`: cliente Supabase exclusivo do servidor.
- `supabase/schema.sql`: tabelas, índices, gatilhos de normalização e políticas RLS.
