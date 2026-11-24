import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin(request: Request) {
  const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  if (!allowedEmail) {
    return {
      response: NextResponse.json(
        { error: "ADMIN_EMAIL não está configurado." },
        { status: 503 },
      ),
    };
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return {
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const { data, error } = await createSupabaseServerClient().auth.getUser(token);
  if (error || !data.user) {
    return {
      response: NextResponse.json({ error: "Sessão inválida." }, { status: 401 }),
    };
  }

  if (data.user.email?.trim().toLocaleLowerCase("en-US") !== allowedEmail) {
    return {
      response: NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 }),
    };
  }

  return { user: data.user };
}
