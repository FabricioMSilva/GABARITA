"use client";

import { FormEvent, useState } from "react";

type GenerationResponse =
  | {
      status: "available";
      course: { id: string; title: string };
    }
  | {
      status: "review";
      course: { id: string; title: string };
      message: string;
    }
  | {
      status: "queued" | "processing";
      queueId: string;
      message: string;
    };

export default function GeneratePage() {
  const [concurso, setConcurso] = useState("");
  const [profissao, setProfissao] = useState("");
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurso, profissao }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Não foi possível iniciar a geração.");
        return;
      }

      setResult(payload as GenerationResponse);
    } catch {
      setError("Não foi possível conectar ao serviço. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Gerador de cursos
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          Prepare-se para o seu próximo concurso
        </h1>
        <p className="mt-3 text-slate-600">
          Informe o concurso e a profissão para encontrar um curso ou solicitar
          sua criação.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-700"
              htmlFor="concurso"
            >
              Concurso
            </label>
            <input
              autoComplete="organization"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              id="concurso"
              maxLength={120}
              onChange={(event) => setConcurso(event.target.value)}
              placeholder="Ex.: Transpetro"
              required
              value={concurso}
            />
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-700"
              htmlFor="profissao"
            >
              Profissão
            </label>
            <input
              autoComplete="organization-title"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              id="profissao"
              maxLength={120}
              onChange={(event) => setProfissao(event.target.value)}
              placeholder="Ex.: Enfermagem"
              required
              value={profissao}
            />
          </div>

          <button
            className="w-full rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Consultando..." : "Buscar ou gerar curso"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <a className="underline hover:text-blue-700" href="/admin">
            Área do administrador
          </a>
        </p>

        {result?.status === "available" && (
          <div
            aria-live="polite"
            className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900"
          >
            <p className="font-semibold">Curso disponível</p>
            <p className="mt-1">{result.course.title}</p>
          </div>
        )}

        {result?.status === "review" && (
          <div
            aria-live="polite"
            className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
          >
            <p className="font-semibold">Curso em revisão</p>
            <p className="mt-1">{result.message}</p>
          </div>
        )}

        {(result?.status === "queued" || result?.status === "processing") && (
          <div
            aria-live="polite"
            className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900"
          >
            <p className="font-semibold">
              {result.status === "queued"
                ? "Solicitação adicionada à fila"
                : "Este curso já está sendo preparado"}
            </p>
            <p className="mt-1">{result.message}</p>
          </div>
        )}

        {error && (
          <p
            aria-live="polite"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
