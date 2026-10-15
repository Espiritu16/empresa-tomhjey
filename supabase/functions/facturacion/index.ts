import {
  autenticar,
  clientePrivilegiado,
  ErrorHttp,
  exigirAdministrador,
  exigirObjetoJson,
  preflight,
  responderJson,
  respuestaError,
  type SesionAutenticada,
} from "../_shared/http.ts";
import {
  coincideConReserva,
  crearClienteNubefact,
  emitirReconciliando,
  ErrorNubefact,
  type PayloadNubefact,
  type RespuestaNubefact,
  validarConfiguracionEmision,
} from "./nubefact.ts";

type ReservaComprobante = {
  comprobante_id: string;
  estado: string;
  puede_emitir: boolean;
  reconciliar: boolean;
  serie?: string;
  numero?: number;
  payload: PayloadNubefact;
};

type ReservaConsultaBoleta = {
  comprobante_id: string;
  serie: string;
  numero: number;
  payload: PayloadNubefact;
};

type ReservaConsultaFactura = ReservaConsultaBoleta;

function leerCredenciales() {
  const ruta = Deno.env.get("NUBEFACT_RUTA");
  const token = Deno.env.get("NUBEFACT_TOKEN");
  if (!ruta || !token) {
    throw new ErrorHttp(
      "La facturación todavía no está configurada.",
      503,
      "facturacion_no_configurada",
    );
  }
  return { ruta, token };
}

async function exigirConfiguracionEmision(
  cliente: ReturnType<typeof clientePrivilegiado>,
) {
  const { data: empresa, error } = await cliente
    .from("empresa")
    .select("ruc")
    .maybeSingle();
  if (error) {
    throw new ErrorHttp(
      "No se pudo verificar el RUC de la empresa.",
      503,
      "emisor_no_verificado",
    );
  }

  validarConfiguracionEmision({
    ambiente: Deno.env.get("NUBEFACT_AMBIENTE") ?? null,
    rucEmpresa: empresa?.ruc ?? null,
    rucEmisor: Deno.env.get("NUBEFACT_RUC_EMISOR") ?? null,
    permitirProduccion: Deno.env.get("NUBEFACT_PERMITIR_PRODUCCION") === "true",
  });
}

async function registrarResultado(
  cliente: ReturnType<typeof clientePrivilegiado>,
  administradorId: string,
  comprobanteId: string,
  estado: "emitido" | "rechazado" | "error",
  respuesta: Record<string, unknown>,
  errorMostrable: string | null,
) {
  const { error } = await cliente.rpc("registrar_resultado_comprobante", {
    administrador_objetivo: administradorId,
    comprobante_objetivo: comprobanteId,
    estado_resultado: estado,
    respuesta,
    error_mostrable: errorMostrable,
  });
  if (error)
    throw new ErrorHttp(
      "No se pudo guardar el resultado de emisión.",
      500,
      "resultado_no_guardado",
    );
}

async function manejar(request: Request): Promise<Response> {
  const cors = preflight(request);
  if (cors) return cors;
  let sesionActiva: SesionAutenticada | null = null;
  let reservaActiva: ReservaComprobante | null = null;
  try {
    const sesion = await autenticar(request);
    sesionActiva = sesion;
    const cuerpo = exigirObjetoJson(await request.json().catch(() => null));
    const clienteInterno = clientePrivilegiado();

    if (cuerpo.operacion === "consultar_boleta") {
      exigirAdministrador(sesion);
      const comprobanteId = cuerpo.comprobanteId;
      if (
        typeof comprobanteId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(comprobanteId)
      ) {
        throw new ErrorHttp(
          "Selecciona una boleta válida.",
          400,
          "comprobante_invalido",
        );
      }

      const credenciales = leerCredenciales();
      const { data: dataReserva, error: errorReserva } =
        await clienteInterno.rpc("reservar_consulta_boleta", {
          administrador_objetivo: sesion.usuarioId,
          comprobante_objetivo: comprobanteId,
        });
      if (errorReserva) {
        const forbidden = errorReserva.code === "42501";
        const ocupado = errorReserva.code === "55P03";
        throw new ErrorHttp(
          errorReserva.message,
          forbidden ? 403 : ocupado ? 409 : 422,
          forbidden
            ? "rol_requerido"
            : ocupado
              ? "consulta_en_proceso"
              : "consulta_no_disponible",
        );
      }

      const reserva = dataReserva as ReservaConsultaBoleta;
      const clienteNubefact = crearClienteNubefact(credenciales);
      let respuesta: RespuestaNubefact | null = null;
      try {
        respuesta = await clienteNubefact.consultar(
          reserva.payload.tipo_de_comprobante,
          reserva.serie,
          reserva.numero,
        );
      } catch (error) {
        if (!(error instanceof ErrorNubefact) || error.codigo !== 24)
          throw error;
      }

      if (respuesta && !coincideConReserva(respuesta, reserva.payload)) {
        throw new ErrorNubefact(
          "La respuesta consultada no coincide con la boleta reservada. Requiere revisión.",
          23,
          409,
        );
      }

      const { error: errorRegistro } = await clienteInterno.rpc(
        "registrar_consulta_boleta",
        {
          administrador_objetivo: sesion.usuarioId,
          comprobante_objetivo: reserva.comprobante_id,
          respuesta,
        },
      );
      if (errorRegistro) {
        throw new ErrorHttp(
          "No se pudo guardar el resultado de consulta.",
          500,
          "consulta_no_guardada",
        );
      }

      return responderJson({
        comprobanteId: reserva.comprobante_id,
        encontrada: respuesta !== null,
        aceptadaPorSunat: respuesta?.aceptada_por_sunat === true,
        respuesta,
      });
    }

    if (cuerpo.operacion === "consultar_factura") {
      exigirAdministrador(sesion);
      const comprobanteId = cuerpo.comprobanteId;
      if (
        typeof comprobanteId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(comprobanteId)
      ) {
        throw new ErrorHttp(
          "Selecciona una factura válida.",
          400,
          "comprobante_invalido",
        );
      }

      const credenciales = leerCredenciales();
      const { data: dataReserva, error: errorReserva } =
        await clienteInterno.rpc("reservar_consulta_factura", {
          administrador_objetivo: sesion.usuarioId,
          comprobante_objetivo: comprobanteId,
        });
      if (errorReserva) {
        const forbidden = errorReserva.code === "42501";
        const ocupado = errorReserva.code === "55P03";
        throw new ErrorHttp(
          errorReserva.message,
          forbidden ? 403 : ocupado ? 409 : 422,
          forbidden
            ? "rol_requerido"
            : ocupado
              ? "consulta_en_proceso"
              : "consulta_no_disponible",
        );
      }

      const reserva = dataReserva as ReservaConsultaFactura;
      const clienteNubefact = crearClienteNubefact(credenciales);
      let respuesta: RespuestaNubefact | null = null;
      try {
        respuesta = await clienteNubefact.consultar(
          reserva.payload.tipo_de_comprobante,
          reserva.serie,
          reserva.numero,
        );
      } catch (error) {
        if (!(error instanceof ErrorNubefact) || error.codigo !== 24)
          throw error;
      }

      if (respuesta && !coincideConReserva(respuesta, reserva.payload)) {
        throw new ErrorNubefact(
          "La respuesta consultada no coincide con la factura reservada. Requiere revisión.",
          23,
          409,
        );
      }

      const { error: errorRegistro } = await clienteInterno.rpc(
        "registrar_consulta_factura",
        {
          administrador_objetivo: sesion.usuarioId,
          comprobante_objetivo: reserva.comprobante_id,
          respuesta,
        },
      );
      if (errorRegistro) {
        throw new ErrorHttp(
          "No se pudo guardar el resultado de consulta.",
          500,
          "consulta_no_guardada",
        );
      }

      return responderJson({
        comprobanteId: reserva.comprobante_id,
        encontrada: respuesta !== null,
        aceptadaPorSunat: respuesta?.aceptada_por_sunat === true,
        respuesta,
      });
    }

    if (cuerpo.operacion === "configurar_serie") {
      exigirAdministrador(sesion);
      const tipo = cuerpo.tipo;
      const serie = cuerpo.serie;
      const siguienteNumero = cuerpo.siguienteNumero;
      if (
        (tipo !== "factura" && tipo !== "boleta") ||
        typeof serie !== "string" ||
        typeof siguienteNumero !== "number" ||
        !Number.isSafeInteger(siguienteNumero) ||
        siguienteNumero <= 0
      ) {
        throw new ErrorHttp(
          "Indica una serie válida y un correlativo positivo.",
          400,
          "serie_invalida",
        );
      }

      const { data: serieGuardada, error: errorSerie } =
        await clienteInterno.rpc("configurar_serie_comprobante", {
          administrador_objetivo: sesion.usuarioId,
          tipo_solicitado: tipo,
          serie_solicitada: serie,
          siguiente_solicitado: siguienteNumero,
        });
      if (errorSerie) {
        const forbidden = errorSerie.code === "42501";
        throw new ErrorHttp(
          errorSerie.message,
          forbidden ? 403 : 422,
          forbidden ? "rol_requerido" : "serie_no_configurada",
        );
      }
      if (!serieGuardada) {
        throw new ErrorHttp(
          "No se pudo guardar la serie.",
          500,
          "serie_no_configurada",
        );
      }
      return responderJson({
        serie: serieGuardada.serie,
        siguienteNumero: serieGuardada.siguiente_numero,
      });
    }

    if (cuerpo.operacion !== undefined) {
      throw new ErrorHttp(
        "La operación de facturación no es válida.",
        400,
        "operacion_invalida",
      );
    }

    const ventaId = cuerpo.ventaId;
    const tipo = cuerpo.tipo;
    if (typeof ventaId !== "string" || !/^[0-9a-f-]{36}$/i.test(ventaId)) {
      throw new ErrorHttp(
        "Selecciona una venta válida.",
        400,
        "venta_invalida",
      );
    }
    if (tipo !== "factura" && tipo !== "boleta") {
      throw new ErrorHttp("Selecciona factura o boleta.", 400, "tipo_invalido");
    }
    if (
      sesion.perfil.rol !== "administrador" &&
      sesion.perfil.rol !== "vendedor"
    ) {
      throw new ErrorHttp(
        "La cuenta no puede emitir comprobantes.",
        403,
        "rol_requerido",
      );
    }

    const credenciales = leerCredenciales();
    await exigirConfiguracionEmision(clienteInterno);
    const { data, error } = await clienteInterno.rpc("reservar_comprobante", {
      administrador_objetivo: sesion.usuarioId,
      venta_objetivo: ventaId,
      tipo_solicitado: tipo,
    });
    if (error) {
      const forbidden = error.code === "42501";
      throw new ErrorHttp(
        error.message,
        forbidden ? 403 : 422,
        forbidden ? "rol_requerido" : "venta_no_emitible",
      );
    }
    const reserva = data as ReservaComprobante;
    reservaActiva = reserva;
    if (!reserva.puede_emitir) {
      return responderJson({
        comprobanteId: reserva.comprobante_id,
        estado: reserva.estado,
        aceptadaPorSunat: null,
        requiereReintento: reserva.estado === "emitiendo",
      });
    }

    const clienteNubefact = crearClienteNubefact(credenciales);
    let resultado: RespuestaNubefact;
    if (reserva.reconciliar && reserva.serie && reserva.numero) {
      try {
        const existente = await clienteNubefact.consultar(
          reserva.payload.tipo_de_comprobante,
          reserva.serie,
          reserva.numero,
        );
        if (!coincideConReserva(existente, reserva.payload)) {
          throw new ErrorNubefact(
            "NubeFacT tiene ocupado el número con un comprobante distinto.",
            23,
            409,
          );
        }
        resultado = existente;
      } catch (consultaError) {
        if (
          !(consultaError instanceof ErrorNubefact) ||
          consultaError.codigo !== 24
        ) {
          throw consultaError;
        }
        resultado = await emitirReconciliando(reserva.payload, credenciales);
      }
    } else {
      resultado = await emitirReconciliando(reserva.payload, credenciales);
    }

    await registrarResultado(
      clienteInterno,
      sesion.usuarioId,
      reserva.comprobante_id,
      "emitido",
      resultado,
      null,
    );
    return responderJson({
      comprobanteId: reserva.comprobante_id,
      estado: "emitido",
      aceptadaPorSunat:
        tipo === "factura" && resultado.aceptada_por_sunat === true,
      respuesta: resultado,
    });
  } catch (error) {
    if (error instanceof ErrorNubefact) {
      const estado =
        error.codigo === 21 || error.estadoHttp === 400 ? "rechazado" : "error";
      if (
        sesionActiva &&
        reservaActiva?.comprobante_id &&
        reservaActiva.puede_emitir
      ) {
        try {
          await registrarResultado(
            clientePrivilegiado(),
            sesionActiva.usuarioId,
            reservaActiva.comprobante_id,
            estado,
            { errors: error.message, codigo: error.codigo },
            error.message,
          );
        } catch {
          // El lease de emisión permite reconciliar si no se pudo guardar el error.
        }
      }
      return responderJson(
        { detalle: error.message, codigo: "error_facturacion" },
        error.estadoHttp >= 500 ? error.estadoHttp : 422,
      );
    }
    return respuestaError(error);
  }
}

Deno.serve(manejar);
