/// <reference lib="deno.ns" />

import {
  autenticar,
  ErrorHttp,
  exigirObjetoJson,
  preflight,
  responderJson,
  respuestaError,
} from "../_shared/http.ts";
import { reposicionDesdeMvp } from "./datos-mvp.ts";
import parametros from "./modelo.json" with { type: "json" };
import {
  catalogoModelo,
  ErrorValidacion,
  type ParametrosModelo,
  predecirDemanda,
} from "./modelo.ts";

const modelo = parametros as ParametrosModelo;

async function atender(request: Request): Promise<Response> {
  const cors = preflight(request);
  if (cors) return cors;
  try {
    // Administrador y vendedor pueden consultar la sugerencia de reposición.
    const sesion = await autenticar(request);
    const cuerpo = exigirObjetoJson(await request.json().catch(() => null));
    if (cuerpo.consulta === "catalogo") {
      return responderJson(catalogoModelo(modelo));
    }
    if (cuerpo.consulta === "reposicion") {
      // Usa el cliente con la sesión del usuario: las políticas RLS siguen aplicando.
      return responderJson(await reposicionDesdeMvp(sesion.cliente, modelo));
    }
    try {
      return responderJson(predecirDemanda(cuerpo, modelo));
    } catch (error) {
      if (error instanceof ErrorValidacion) {
        throw new ErrorHttp(error.message, 400, "entrada_invalida");
      }
      throw error;
    }
  } catch (error) {
    return respuestaError(error);
  }
}

Deno.serve(atender);
