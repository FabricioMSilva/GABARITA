import type { FilaGeracaoRow } from "@/lib/types/database";

const MAX_SUBJECTS = 30;
const MAX_TOPICS_PER_SUBJECT = 8;
const MAX_TOPIC_LENGTH = 180;

type GeneratedCourse = {
  title: string;
  description: string;
  subjects: {
    name: string;
    lessons: { title: string; content: string }[];
  }[];
};

function normalizeHeading(value: string) {
  return value
    .replace(/^\s*(?:\d+(?:\.\d+)*[.)]?\s*)?(?:[-•*]\s*)?/, "")
    .replace(/[:;]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function cleanTopic(value: string) {
  return value
    .replace(/^\s*(?:\d+(?:\.\d+)*[.)]?\s*)?(?:[-•*]\s*)?/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOPIC_LENGTH);
}

function extractTopics(
  sourceText: string,
  subjects: string[],
  subject: string,
): string[] {
  const lines = sourceText.split(/\r?\n/);
  const normalizedSubject = normalizeHeading(subject);
  const start = lines.findIndex(
    (line) => normalizeHeading(line) === normalizedSubject,
  );

  if (start < 0) {
    return [];
  }

  const nextSubjectHeadings = new Set(
    subjects
      .filter((name) => name !== subject)
      .map(normalizeHeading),
  );
  const topics = new Set<string>();

  for (const line of lines.slice(start + 1)) {
    if (nextSubjectHeadings.has(normalizeHeading(line))) {
      break;
    }

    for (const part of line.split(/[;•]/)) {
      const topic = cleanTopic(part);
      if (
        topic.length >= 12 &&
        /[A-Za-zÀ-ÿ]/.test(topic) &&
        !/^(?:p[aá]gina\s+\d+|\d+\s*\/\s*\d+)$/i.test(topic)
      ) {
        topics.add(topic);
        if (topics.size >= MAX_TOPICS_PER_SUBJECT) {
          return [...topics];
        }
      }
    }
  }

  return [...topics];
}

function buildLessons(subject: string, topics: string[]) {
  const topicList = topics.length
    ? topics.map((topic) => `- ${topic}`).join("\n")
    : "Nenhum tópico específico foi extraído para esta matéria. Consulte o edital oficial.";

  return [
    {
      title: `Mapa do edital: ${subject}`,
      content: [
        `Matéria: ${subject}.`,
        "Tópicos detectados no texto do edital (confirme a lista no documento oficial):",
        topicList,
        "Este roteiro foi montado por regras fixas; não contém explicações oficiais nem substitui o edital.",
      ].join("\n\n"),
    },
    {
      title: `Plano de estudo: ${subject}`,
      content: [
        `Use esta trilha para estudar ${subject}:`,
        "1. Leia cada tópico no edital e em uma fonte confiável.",
        "2. Registre conceitos, normas, fórmulas ou procedimentos aplicáveis.",
        "3. Marque dúvidas e confirme respostas em material oficial ou didático.",
        `Tópicos de referência:\n${topicList}`,
      ].join("\n\n"),
    },
    {
      title: `Prática orientada: ${subject}`,
      content: [
        `Atividade para ${subject}: escolha questões anteriores da banca sobre os tópicos do edital.`,
        "Resolva sem consultar o material, registre os erros e anote a fonte usada para corrigir cada dúvida.",
        "O sistema não cria questões nem gabaritos fictícios; use provas e fontes verificáveis.",
        `Tópicos para buscar questões:\n${topicList}`,
      ].join("\n\n"),
    },
    {
      title: `Revisão espaçada: ${subject}`,
      content: [
        `Revise ${subject} em três momentos: no dia seguinte ao estudo, após uma semana e após um mês.`,
        "Em cada revisão, tente explicar os tópicos sem consultar suas anotações e confira depois em uma fonte confiável.",
        `Checklist de tópicos:\n${topicList}`,
      ].join("\n\n"),
    },
    {
      title: `Checklist final: ${subject}`,
      content: [
        `Antes da prova, confira cada tópico de ${subject}:`,
        ...topics.map((topic) => `- Consigo explicar e resolver questões sobre: ${topic}?`),
        ...(topics.length
          ? []
          : ["- Consultei o conteúdo programático diretamente no edital oficial?"]),
        "Resolva questões da banca e confirme pontos controversos em fontes oficiais.",
      ].join("\n"),
    },
  ];
}

export function generateRuleBasedCourse(
  job: FilaGeracaoRow,
  sourceText: string,
  detectedSubjects: string[],
): GeneratedCourse {
  const subjects = [...new Set(detectedSubjects.map((name) => name.trim()))]
    .filter((name) => name.length >= 2)
    .slice(0, MAX_SUBJECTS);

  if (!subjects.length) {
    throw new Error(
      "Nenhuma matéria foi identificada no edital; o curso não será publicado com conteúdo vazio.",
    );
  }

  return {
    title: `Plano de estudos: ${job.concurso} - ${job.profissao}`.slice(0, 160),
    description:
      "Trilha de estudo organizada por regras fixas a partir das matérias e tópicos detectados no edital. As aulas são roteiros e atividades de estudo, não explicações ou gabaritos gerados por IA.",
    subjects: subjects.map((name) => ({
      name,
      lessons: buildLessons(name, extractTopics(sourceText, subjects, name)),
    })),
  };
}
