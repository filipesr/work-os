import { describe, it, expect } from "vitest";
import {
  composePresence,
  formatWorkDuration,
  type PresenceUser,
  type PresenceActiveLog,
} from "@/lib/presence-types";

const user = (id: string, name: string): PresenceUser => ({
  id,
  name,
  email: `${id}@x.com`,
  image: null,
  role: "MEMBER",
  teams: [],
  lastSeenAt: null,
});

const log = (userId: string): PresenceActiveLog => ({
  startedAt: new Date("2026-08-12T10:00:00Z"),
  user: { id: userId },
  task: {
    id: `t-${userId}`,
    title: "Arte do carrossel",
    project: { id: "p1", name: "Projeto", client: { name: "Cliente" } },
  },
});

describe("composePresence", () => {
  it("anexa o trabalho em curso à pessoa certa", () => {
    const out = composePresence([user("a", "Ana"), user("b", "Bruno")], [], [log("b")], {
      onlineFirst: true,
    });
    expect(out.find((e) => e.id === "a")?.activeLog).toBeUndefined();
    expect(out.find((e) => e.id === "b")?.activeLog?.task.title).toBe("Arte do carrossel");
  });

  it("marca online e offline corretamente", () => {
    const out = composePresence([user("a", "Ana")], [user("z", "Zoe")], [], {
      onlineFirst: true,
    });
    expect(out.find((e) => e.id === "a")?.isOnline).toBe(true);
    expect(out.find((e) => e.id === "z")?.isOnline).toBe(false);
  });

  it("onlineFirst=true põe quem está aí agora primeiro (board = triagem)", () => {
    const out = composePresence([user("z", "Zoe")], [user("a", "Ana")], [], {
      onlineFirst: true,
    });
    expect(out.map((e) => e.id)).toEqual(["z", "a"]);
  });

  it("onlineFirst=false mantém ordem alfabética estável (mural)", () => {
    // Num monitor de parede, reordenar por estado a cada tick de 10s faz os
    // cards pularem de lugar — ilegível de longe.
    const out = composePresence([user("z", "Zoe")], [user("a", "Ana")], [], {
      onlineFirst: false,
    });
    expect(out.map((e) => e.id)).toEqual(["a", "z"]);
  });

  it("ordena por nome dentro do mesmo estado", () => {
    const out = composePresence([user("c", "Carla"), user("a", "Ana")], [], [], {
      onlineFirst: true,
    });
    expect(out.map((e) => e.name)).toEqual(["Ana", "Carla"]);
  });

  it("cai no email quando a pessoa não tem nome", () => {
    const noName = { ...user("x", "x"), name: null };
    const out = composePresence([noName, user("a", "Ana")], [], [], { onlineFirst: true });
    expect(out).toHaveLength(2);
  });

  it("listas vazias → resultado vazio", () => {
    expect(composePresence([], [], [], { onlineFirst: true })).toEqual([]);
  });
});

describe("formatWorkDuration", () => {
  const start = new Date("2026-08-12T10:00:00Z").getTime();

  it("mostra só minutos abaixo de uma hora", () => {
    expect(formatWorkDuration(new Date(start), start + 40 * 60000)).toBe("40min");
  });

  it("mostra horas e minutos acima de uma hora", () => {
    expect(formatWorkDuration(new Date(start), start + 135 * 60000)).toBe("2h 15min");
  });

  it("nunca devolve duração negativa (relógio adiantado no cliente)", () => {
    expect(formatWorkDuration(new Date(start), start - 60000)).toBe("0min");
  });

  it("aceita ISO string além de Date (o stream serializa em JSON)", () => {
    expect(formatWorkDuration("2026-08-12T10:00:00Z", start + 90 * 60000)).toBe("1h 30min");
  });
});
