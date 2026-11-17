/// <reference lib="deno.ns" />

import {
  autenticar,
  ErrorHttp,
  exigirObjetoJson,
  preflight,
  responderJson,
  respuestaError,
} from "../_shared/http.ts";
import parametros from "./modelo.json" with { type: "json" };
import {
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
    await autenticar(request);
    const cuerpo = exigirObjetoJson(await request.json().catch(() => null));
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
