import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { obtenerConfiguracionPublicaSupabase } from "./variables";

export async function actualizarSesion(request: NextRequest) {
  const { url, clavePublicable } = obtenerConfiguracionPublicaSupabase();
  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(url, clavePublicable, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        respuesta = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          respuesta.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return respuesta;
}
