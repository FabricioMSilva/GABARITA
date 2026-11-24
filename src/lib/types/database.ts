export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDefinition<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type CourseSubject = {
  name: string;
  lessons: { title: string; content: string }[];
};

export type CursoRow = {
  id: string;
  concurso: string;
  profissao: string;
  concurso_key: string;
  profissao_key: string;
  titulo: string;
  descricao: string | null;
  edital_url: string | null;
  status: "draft" | "ready" | "archived";
  created_at: string;
  updated_at: string;
};

export type FilaGeracaoRow = {
  id: string;
  concurso: string;
  profissao: string;
  concurso_key: string;
  profissao_key: string;
  status: "queued" | "processing" | "completed" | "failed";
  curso_id: string | null;
  erro: string | null;
  tentativas: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  next_attempt_at: string;
  locked_until: string | null;
  last_error: string | null;
};

export type MateriaRow = {
  id: string;
  curso_id: string;
  nome: string;
  ordem: number;
  created_at: string;
};

export type AulaRow = {
  id: string;
  materia_id: string;
  titulo: string;
  conteudo: string | null;
  ordem: number;
  created_at: string;
};

export type ConcursoMonitoradoRow = {
  id: string;
  nome: string;
  profissao: string;
  concurso_key: string;
  profissao_key: string;
  feed_url: string;
  palavras_chave: string[];
  ativo: boolean;
  intervalo_minutos: number;
  ultima_verificacao: string | null;
  proxima_verificacao: string;
  locked_until: string | null;
  ultimo_erro: string | null;
  created_at: string;
  updated_at: string;
};

export type EditalEncontradoRow = {
  id: string;
  concurso_id: string;
  external_id: string;
  fingerprint: string;
  titulo: string;
  source_url: string;
  edital_url: string | null;
  publicado_em: string | null;
  resumo: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  created_at: string;
};

export type ProcessamentoEditalRow = {
  id: string;
  edital_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  tentativas: number;
  next_attempt_at: string;
  locked_until: string | null;
  texto_extraido: string | null;
  materias: Json;
  ultimo_erro: string | null;
  processado_em: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificacaoRow = {
  id: string;
  fila_geracao_id: string | null;
  tipo: string;
  payload: Json;
  status: "pending" | "sent" | "failed";
  tentativas: number;
  ultimo_erro: string | null;
  created_at: string;
  sent_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      cursos: TableDefinition<CursoRow>;
      fila_geracao: TableDefinition<FilaGeracaoRow>;
      materias: TableDefinition<MateriaRow>;
      aulas: TableDefinition<AulaRow>;
      concursos_monitorados: TableDefinition<ConcursoMonitoradoRow>;
      editais_encontrados: TableDefinition<EditalEncontradoRow>;
      processamento_editais: TableDefinition<ProcessamentoEditalRow>;
      notificacoes: TableDefinition<NotificacaoRow>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_due_concursos: {
        Args: { p_limit?: number };
        Returns: ConcursoMonitoradoRow[];
      };
      register_edital_found: {
        Args: {
          p_concurso_id: string;
          p_external_id: string;
          p_fingerprint: string;
          p_titulo: string;
          p_source_url: string;
          p_edital_url: string | null;
          p_publicado_em: string | null;
          p_resumo: string | null;
        };
        Returns: { edital_id: string; created: boolean }[];
      };
      claim_pending_edital_jobs: {
        Args: { p_limit?: number };
        Returns: ProcessamentoEditalRow[];
      };
      claim_generation_jobs: {
        Args: { p_limit?: number };
        Returns: FilaGeracaoRow[];
      };
      link_existing_course: {
        Args: { p_queue_id: string; p_curso_id: string };
        Returns: string;
      };
      publish_generated_course: {
        Args: {
          p_queue_id: string;
          p_titulo: string;
          p_descricao: string;
          p_edital_url: string | null;
          p_materias: Json;
        };
        Returns: string;
      };
      create_course_draft: {
        Args: {
          p_queue_id: string;
          p_titulo: string;
          p_descricao: string;
          p_edital_url: string | null;
          p_materias: Json;
        };
        Returns: string;
      };
      review_course_draft: {
        Args: {
          p_curso_id: string;
          p_titulo: string;
          p_descricao: string;
          p_materias: Json;
          p_aprovar: boolean;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
