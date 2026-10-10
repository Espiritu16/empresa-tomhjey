import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript loader requires the extension at runtime.
import { limpiarDatosE2E } from "./limpieza-datos.ts";

type Operacion = {
  tabla: string;
  accion: string;
  campo: string;
  valor: unknown;
};

class ConsultaSimulada {
  accion = "select";
  private readonly tabla: string;
  private readonly operaciones: Operacion[];

  constructor(tabla: string, operaciones: Operacion[]) {
    this.tabla = tabla;
    this.operaciones = operaciones;
  }

  select() {
    this.accion = "select";
    return this;
  }

  delete() {
    this.accion = "delete";
    return this;
  }

  in(campo: string, valor: unknown) {
    this.operaciones.push({
      tabla: this.tabla,
      accion: this.accion,
      campo,
      valor,
    });
    return this;
  }

  like(campo: string, valor: unknown) {
    this.operaciones.push({
      tabla: this.tabla,
      accion: this.accion,
      campo,
      valor,
    });
    return this;
  }

  eq(campo: string, valor: unknown) {
    this.operaciones.push({
      tabla: this.tabla,
      accion: this.accion,
      campo,
      valor,
    });
    return this;
  }

  then(resolve: (resultado: { data: unknown[]; error: null }) => unknown) {
    return Promise.resolve({ data: [], error: null }).then(resolve);
  }
}

test("la limpieza E2E solo borra categorías e invitaciones de su ejecución", async () => {
  const identificador = "ejecucion-actual";
  const operaciones: Operacion[] = [];
  const usuariosEliminados: string[] = [];
  const prefijoInvitacion = `e2e-invitado-${identificador}-`;
  const prefijoCategoria = `E2E-${identificador}-`;
  const cliente = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: "invitado-actual",
                email: `${prefijoInvitacion}uno@example.com`,
              },
              {
                id: "invitado-ajeno",
                email: "e2e-invitado-otra-ejecucion@example.com",
              },
            ],
          },
          error: null,
        }),
        deleteUser: async (id: string) => {
          usuariosEliminados.push(id);
          return { error: null };
        },
      },
    },
    from: (tabla: string) => new ConsultaSimulada(tabla, operaciones),
  };

  const limpiarConPrefijo = limpiarDatosE2E as unknown as (
    cliente: never,
    usuarioIds: string[],
    empresaCreada: boolean,
    identificadorE2E: string,
  ) => Promise<void>;
  await limpiarConPrefijo(cliente as never, [], false, identificador);

  assert.deepEqual(usuariosEliminados, ["invitado-actual"]);
  assert.deepEqual(
    operaciones.filter(
      (operacion) =>
        operacion.accion === "delete" && operacion.campo === "correo",
    ),
    [
      {
        tabla: "invitaciones",
        accion: "delete",
        campo: "correo",
        valor: `${prefijoInvitacion}%@example.com`,
      },
    ],
  );
  assert.deepEqual(
    operaciones.filter(
      (operacion) =>
        operacion.accion === "delete" && operacion.campo === "nombre",
    ),
    [
      {
        tabla: "categorias",
        accion: "delete",
        campo: "nombre",
        valor: `${prefijoCategoria}%`,
      },
    ],
  );
  assert.deepEqual(
    operaciones.filter((operacion) => operacion.tabla === "perfiles"),
    [
      {
        tabla: "perfiles",
        accion: "delete",
        campo: "id",
        valor: "invitado-actual",
      },
    ],
  );
});
