"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  ReviewCourse,
  ReviewLesson,
  ReviewSubject,
} from "@/lib/types/course-review";

async function fetchDrafts(accessToken: string): Promise<ReviewCourse[]> {
  const response = await fetch("/api/admin/courses", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    courses?: ReviewCourse[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Não foi possível carregar os rascunhos.");
  }
  return payload.courses ?? [];
}

export default function AdminPage() {
  const [supabase, setSupabase] = useState<ReturnType<
    typeof createSupabaseBrowserClient
  >>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [drafts, setDrafts] = useState<ReviewCourse[]>([]);
  const [editing, setEditing] = useState<ReviewCourse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    setSupabase(client);
    if (!client) {
      setIsLoading(false);
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) {
        return;
      }
      if (sessionError) {
        setError("Não foi possível verificar a sessão.");
      }
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setDrafts([]);
      setEditing(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError("");
    void fetchDrafts(session.access_token)
      .then((courses) => {
        if (active) {
          setDrafts(courses);
          setEditing((current) =>
            current
              ? courses.find((course) => course.id === current.id) ?? null
              : courses[0] ?? null,
          );
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os rascunhos.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabase) {
      setError("Configure NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.");
      return;
    }

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) {
        setError(loginError.message);
        return;
      }
      setSession(data.session);
      setPassword("");
    } catch {
      setError("Não foi possível conectar à autenticação do Supabase.");
    }
  }

  async function handlePasswordRecovery() {
    if (!supabase) {
      setError("Configure NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.");
      return;
    }
    if (!email.trim()) {
      setError("Informe seu e-mail para receber o link de redefinição.");
      return;
    }

    setError("");
    setNotice("");
    setIsSendingRecovery(true);
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/admin/redefinir-senha`,
        },
      );
      if (recoveryError) {
        setError(recoveryError.message);
        return;
      }

      setNotice(
        "Se o e-mail estiver cadastrado, enviaremos um link para definir sua senha.",
      );
    } catch {
      setError("Não foi possível solicitar a redefinição de senha.");
    } finally {
      setIsSendingRecovery(false);
    }
  }

  async function handleLogout() {
    if (!supabase) {
      return;
    }
    try {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) {
        setError("Não foi possível encerrar a sessão.");
        return;
      }
      setSession(null);
      setNotice("");
    } catch {
      setError("Não foi possível encerrar a sessão.");
    }
  }

  function updateSubject(
    subjectIndex: number,
    update: Partial<ReviewSubject>,
  ) {
    setEditing((course) =>
      course
        ? {
            ...course,
            subjects: course.subjects.map((subject, index) =>
              index === subjectIndex ? { ...subject, ...update } : subject,
            ),
          }
        : course,
    );
  }

  function updateLesson(
    subjectIndex: number,
    lessonIndex: number,
    update: Partial<ReviewLesson>,
  ) {
    setEditing((course) =>
      course
        ? {
            ...course,
            subjects: course.subjects.map((subject, currentSubjectIndex) =>
              currentSubjectIndex === subjectIndex
                ? {
                    ...subject,
                    lessons: subject.lessons.map((lesson, currentLessonIndex) =>
                      currentLessonIndex === lessonIndex
                        ? { ...lesson, ...update }
                        : lesson,
                    ),
                  }
                : subject,
            ),
          }
        : course,
    );
  }

  function addSubject() {
    setEditing((course) =>
      course
        ? {
            ...course,
            subjects: [
              ...course.subjects,
              {
                id: `new-subject-${Date.now()}`,
                name: "",
                order: course.subjects.length + 1,
                lessons: [
                  {
                    id: `new-lesson-${Date.now()}`,
                    title: "",
                    content: "",
                    order: 1,
                  },
                ],
              },
            ],
          }
        : course,
    );
  }

  function addLesson(subjectIndex: number) {
    setEditing((course) =>
      course
        ? {
            ...course,
            subjects: course.subjects.map((subject, index) =>
              index === subjectIndex
                ? {
                    ...subject,
                    lessons: [
                      ...subject.lessons,
                      {
                        id: `new-lesson-${Date.now()}`,
                        title: "",
                        content: "",
                        order: subject.lessons.length + 1,
                      },
                    ],
                  }
                : subject,
            ),
          }
        : course,
    );
  }

  async function handleSave(approve: boolean) {
    if (!editing || !session) {
      return;
    }

    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/courses/${editing.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editing.title,
          description: editing.description,
          approve,
          subjects: editing.subjects.map((subject) => ({
            name: subject.name,
            lessons: subject.lessons.map((lesson) => ({
              title: lesson.title,
              content: lesson.content,
            })),
          })),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível salvar o curso.");
      }

      const courses = await fetchDrafts(session.access_token);
      setDrafts(courses);
      setEditing(
        approve
          ? courses[0] ?? null
          : courses.find((course) => course.id === editing.id) ?? null,
      );
      setNotice(
        approve
          ? "Curso aprovado e disponibilizado."
          : "Rascunho salvo.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o curso.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !session) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-slate-600">Carregando área administrativa...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Área administrativa
          </p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            Entrar para revisar cursos
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Use a conta de administrador cadastrada no Supabase.
          </p>

          {!supabase && (
            <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              A autenticação ainda não foi configurada. Defina
              NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.
            </p>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-slate-700">
              E-mail
              <input
                autoComplete="username"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Senha
              <input
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button
              className="w-full rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
              disabled={!supabase}
              type="submit"
            >
              Entrar
            </button>
            <button
              className="w-full rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
              disabled={!supabase || isSendingRecovery}
              onClick={handlePasswordRecovery}
              type="button"
            >
              {isSendingRecovery ? "Enviando link..." : "Esqueci minha senha"}
            </button>
          </form>

          {notice && (
            <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Área administrativa
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Revisão de materiais
          </h1>
          <p className="mt-2 text-slate-600">
            Confira os tópicos no edital, edite as aulas e aprove o material.
          </p>
        </div>
        <button
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          onClick={handleLogout}
          type="button"
        >
          Sair
        </button>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">
            Aguardando revisão ({drafts.length})
          </h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-slate-600">Atualizando...</p>
          ) : drafts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              Nenhum curso aguardando revisão.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {drafts.map((course) => (
                <li key={course.id}>
                  <button
                    className={`w-full rounded-lg border p-3 text-left ${
                      editing?.id === course.id
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={() => setEditing(course)}
                    type="button"
                  >
                    <span className="block font-medium text-slate-900">
                      {course.title}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {course.contest} · {course.profession}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
          {!editing ? (
            <p className="text-slate-600">
              Selecione um curso na lista para revisar.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {editing.contest} · {editing.profession}
                  </h2>
                  {editing.editalUrl && (
                    <a
                      className="mt-2 inline-block text-sm text-blue-700 underline"
                      href={editing.editalUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir edital original
                    </a>
                  )}
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                  Rascunho
                </span>
              </div>

              <label className="mt-6 block text-sm font-medium text-slate-700">
                Título do curso
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3"
                  maxLength={160}
                  onChange={(event) =>
                    setEditing({ ...editing, title: event.target.value })
                  }
                  value={editing.title}
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Descrição
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-4 py-3"
                  maxLength={1000}
                  onChange={(event) =>
                    setEditing({ ...editing, description: event.target.value })
                  }
                  value={editing.description}
                />
              </label>

              <div className="mt-8 space-y-6">
                {editing.subjects.map((subject, subjectIndex) => (
                  <fieldset
                    className="rounded-xl border border-slate-200 p-4"
                    key={subject.id}
                  >
                    <legend className="px-2 font-semibold text-slate-900">
                      Matéria {subjectIndex + 1}
                    </legend>
                    <label className="block text-sm font-medium text-slate-700">
                      Nome da matéria
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2"
                        maxLength={120}
                        onChange={(event) =>
                          updateSubject(subjectIndex, { name: event.target.value })
                        }
                        value={subject.name}
                      />
                    </label>

                    <div className="mt-4 space-y-4">
                      {subject.lessons.map((lesson, lessonIndex) => (
                        <article
                          className="rounded-lg bg-slate-50 p-4"
                          key={lesson.id}
                        >
                          <label className="block text-sm font-medium text-slate-700">
                            Título da aula
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              maxLength={160}
                              onChange={(event) =>
                                updateLesson(subjectIndex, lessonIndex, {
                                  title: event.target.value,
                                })
                              }
                              value={lesson.title}
                            />
                          </label>
                          <label className="mt-3 block text-sm font-medium text-slate-700">
                            Material da aula
                            <textarea
                              className="mt-1 min-h-36 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              maxLength={12_000}
                              onChange={(event) =>
                                updateLesson(subjectIndex, lessonIndex, {
                                  content: event.target.value,
                                })
                              }
                              value={lesson.content}
                            />
                          </label>
                        </article>
                      ))}
                    </div>

                    <button
                      className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                      disabled={subject.lessons.length >= 10}
                      onClick={() => addLesson(subjectIndex)}
                      type="button"
                    >
                      Adicionar aula
                    </button>
                  </fieldset>
                ))}
                <button
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                  disabled={editing.subjects.length >= 30}
                  onClick={addSubject}
                  type="button"
                >
                  Adicionar matéria
                </button>
              </div>

              <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                O gerador usa modelos fixos. Revise as informações com o edital
                e fontes oficiais antes de aprovar.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => handleSave(false)}
                  type="button"
                >
                  Salvar rascunho
                </button>
                <button
                  className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => handleSave(true)}
                  type="button"
                >
                  {isSaving ? "Salvando..." : "Aprovar e disponibilizar"}
                </button>
              </div>
            </>
          )}

          {notice && (
            <p className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-900">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
