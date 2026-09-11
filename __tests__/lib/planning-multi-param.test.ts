import { describe, expect, it } from "vitest";
import { parseMultiParam, serializeMultiParam, toggleInMulti } from "@/lib/planning/multi-param";

const validos = ["a", "b", "c"];

describe("parseMultiParam", () => {
  it("lê a lista separada por vírgula", () => {
    expect(parseMultiParam("a,c", validos)).toEqual(["a", "c"]);
  });

  it("descarta id que não existe mais — pessoa desligada não esconde a grade", () => {
    // O risco real: alguém filtra por uma pessoa, ela sai da equipe, e a tela passa a abrir vazia
    // com um filtro que não dá para desmarcar porque a opção sumiu do seletor.
    expect(parseMultiParam("a,fantasma,c", validos)).toEqual(["a", "c"]);
  });

  it("id repetido entra uma vez só, na ordem em que apareceu", () => {
    expect(parseMultiParam("c,a,c", validos)).toEqual(["c", "a"]);
  });

  it("vazio, ausente e só-lixo dão lista vazia — que significa SEM filtro", () => {
    expect(parseMultiParam(undefined, validos)).toEqual([]);
    expect(parseMultiParam("", validos)).toEqual([]);
    expect(parseMultiParam(" , ,", validos)).toEqual([]);
    expect(parseMultiParam("fantasma", validos)).toEqual([]);
  });

  it("tolera espaço em volta da vírgula", () => {
    expect(parseMultiParam(" a , b ", validos)).toEqual(["a", "b"]);
  });
});

describe("serializeMultiParam", () => {
  it("junta por vírgula", () => {
    expect(serializeMultiParam(["a", "b"])).toBe("a,b");
  });

  it("lista vazia vira null — o parâmetro SAI da URL em vez de ficar vazio", () => {
    // `?user=` na barra de endereço parece filtro ativo para quem lê, e é ruído no link copiado.
    expect(serializeMultiParam([])).toBeNull();
  });
});

describe("toggleInMulti", () => {
  it("acrescenta quem não está", () => {
    expect(toggleInMulti(["a"], "b")).toEqual(["a", "b"]);
  });

  it("tira quem está", () => {
    expect(toggleInMulti(["a", "b"], "a")).toEqual(["b"]);
  });

  it("desmarcar o último volta ao vazio — que é 'todos', não 'nenhum'", () => {
    expect(toggleInMulti(["a"], "a")).toEqual([]);
  });
});
