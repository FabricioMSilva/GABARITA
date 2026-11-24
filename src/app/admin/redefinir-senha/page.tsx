"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { BrandMark } from "@/components/brand-mark";

export default function ResetAdminPasswordPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<
    ReturnType<typeof createSupabaseBrowserClient>
  >(null);
  const [hasSession, setHasSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    setSupabase(client);
    if (!client) {
      setError("A autenticação ainda não foi configurada.");
      setIsLoading(false);
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setHasSession(Boolean(session));
        setIsLoading(false);
      }
    });

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) {
        return;
      }
      if (sessionError) {
        setError("Não foi possível validar o link de redefinição.");
      }
      setHasSession(Boolean(data.session));
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase || !hasSession) {
      setError("O link expirou. Solicite uma nova redefinição de senha.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.replace("/admin");
    } catch {
      setError("Não foi possível salvar a nova senha.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link
          className="mb-8 inline-flex"
          href="/"
          aria-label="Gabarit.AI Brasil — página inicial"
        >
          <BrandMark size="large" />
        </Link>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Área administrativa
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          Definir senha
        </h1>
        {isLoading ? (
          <p className="mt-4 text-sm text-slate-600">
            Validando o link...
          </p>
        ) : !hasSession ? (
          <>
            <p className="mt-4 text-sm text-slate-600">
              O link é inválido ou expirou. Volte ao login e solicite outro.
            </p>
            {error && (
              <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
            <Link
              className="mt-6 inline-block font-semibold text-blue-700 underline"
              href="/admin"
            >
              Voltar ao login
            </Link>
          </>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Nova senha
              <input
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirme a nova senha
              <input
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
            <button
              className="w-full rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Salvando..." : "Salvar nova senha"}
            </button>
            {error && (
              <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
