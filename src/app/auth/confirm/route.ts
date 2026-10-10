import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { obtenerConfiguracionPublicaSupabase } from "@/compartido/supabase/variables";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tipo = request.nextUrl.searchParams.get("type");
  const destino = request.nextUrl.clone();
  if (destino.hostname === "localhost") destino.hostname = "127.0.0.1";
  destino.pathname = "/activar-cuenta";
  destino.search = "";

  if (!tokenHash || tipo !== "invite") {
    destino.pathname = "/acceso";
    destino.searchParams.set("invitacion", "invalida");
    return NextResponse.redirect(destino);
  }

  const { url, clavePublicable } = obtenerConfiguracionPublicaSupabase();
  const respuesta = NextResponse.redirect(destino);
  const supabase = createServerClient(url, clavePublicable, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          respuesta.cookies.set(name, value, options);
        });
      },
    },
  });
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    destino.pathname = "/acceso";
    destino.searchParams.set("invitacion", "vencida");
    respuesta.headers.set("location", destino.toString());
  }

  return respuesta;
}
