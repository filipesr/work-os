import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/actions/artifact", () => ({
  removeFailedArtifact: vi.fn().mockResolvedValue({ success: true }),
  markUploading: vi.fn(),
  prepareArtifactUpload: vi.fn(),
}));
vi.mock("@/lib/nas/upload-client", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/nas/upload-client")>("@/lib/nas/upload-client");
  return { guessMediaType: real.guessMediaType, uploadFileToNas: vi.fn() };
});

import { useNasReupload } from "@/lib/hooks/useNasReupload";
import { uploadFileToNas } from "@/lib/nas/upload-client";
import { removeFailedArtifact } from "@/lib/actions/artifact";

const enviado = vi.mocked(uploadFileToNas);

function montar() {
  return renderHook(() =>
    useNasReupload({
      scope: "TASK",
      ownerIds: { taskId: "t1" },
      // A transição é do container; aqui ela só executa o que recebe.
      startTransition: (fn: () => void) => fn(),
    })
  );
}

/** Um evento de `<input type="file">`, com o alvo que o hook precisa limpar. */
function eventoDeArquivo(file: File | null) {
  const target = { files: file ? [file] : [], value: "C:\\fakepath\\algo.png" };
  return { target } as unknown as React.ChangeEvent<HTMLInputElement>;
}

const arquivo = (nome: string) => new File(["x"], nome, { type: "application/octet-stream" });

beforeEach(() => {
  vi.clearAllMocks();
  enviado.mockResolvedValue({ ok: true, fileName: "arte.png" } as never);
});

describe("useNasReupload", () => {
  it("[CRÍTICO] limpa o valor do input, senão o MESMO arquivo não pode ser reenviado", async () => {
    // O navegador só dispara `change` quando o valor MUDA. Sem zerar, escolher o mesmo arquivo de
    // novo não emite evento nenhum — e a tela fica muda, que é o pior desfecho possível numa ação
    // de RECUPERAÇÃO: a pessoa já está ali porque algo falhou, e a segunda tentativa é a provável.
    const { result } = montar();
    const ev = eventoDeArquivo(arquivo("arte.png"));

    await act(async () => {
      result.current.startReenviar("art-1");
      result.current.onInputChange(ev);
    });

    expect(ev.target.value).toBe("");
  });

  it("extensão desconhecida cai em DOCUMENTOS — nunca num tipo só-de-link", async () => {
    // O servidor recusa pela EXTENSÃO. Mandar FIGMA ou OUTROS faria a recusa falar de TIPO, e a
    // pessoa nunca escolheu tipo nenhum — ela procuraria o erro no lugar errado.
    const { result } = montar();

    await act(async () => {
      result.current.startReenviar("art-1");
      result.current.onInputChange(eventoDeArquivo(arquivo("contrato.xyz")));
    });

    expect(enviado.mock.calls[0][1].mediaType).toBe("DOCUMENTOS");
  });

  it("com extensão conhecida, manda o tipo adivinhado e os donos do escopo", async () => {
    const { result } = montar();

    await act(async () => {
      result.current.startReenviar("art-1");
      result.current.onInputChange(eventoDeArquivo(arquivo("campanha.mp4")));
    });

    expect(enviado.mock.calls[0][1]).toMatchObject({
      scope: "TASK",
      taskId: "t1",
      mediaType: "VIDEOS",
    });
  });

  it("sem ter escolhido o alvo, não envia nada", async () => {
    // `startReenviar` é quem guarda para QUAL artefato o arquivo vai. Um `change` que chegue sem
    // ele — input acionado por outro caminho — não pode virar upload sem destino.
    const { result } = montar();

    await act(async () => {
      result.current.onInputChange(eventoDeArquivo(arquivo("arte.png")));
    });

    expect(enviado).not.toHaveBeenCalled();
  });

  it("cancelar o seletor de arquivo não envia nada", async () => {
    const { result } = montar();

    await act(async () => {
      result.current.startReenviar("art-1");
      result.current.onInputChange(eventoDeArquivo(null));
    });

    expect(enviado).not.toHaveBeenCalled();
  });

  it("marca qual artefato está ocupado, e solta ao terminar", async () => {
    // O id (e não um booleano) é o que permite a lista mostrar o giro só na LINHA que está
    // enviando — com um booleano, a lista inteira pareceria ocupada.
    let solta: (v: unknown) => void = () => {};
    enviado.mockReturnValue(new Promise((r) => (solta = r)) as never);

    const { result } = montar();
    await act(async () => {
      result.current.startReenviar("art-7");
      void result.current.onInputChange(eventoDeArquivo(arquivo("arte.png")));
    });
    expect(result.current.reenviarBusy).toBe("art-7");

    await act(async () => {
      solta({ ok: true, fileName: "arte.png" });
    });
    expect(result.current.reenviarBusy).toBeNull();
  });

  it("remover um upload falho chama a ação e recarrega a tela", async () => {
    const { result } = montar();
    await act(async () => {
      result.current.handleRemoveFailed("art-9");
    });

    expect(removeFailedArtifact).toHaveBeenCalledWith("art-9");
    expect(refresh).toHaveBeenCalled();
  });
});
