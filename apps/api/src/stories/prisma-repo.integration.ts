import { prisma } from "@mimitales/database";
import { emptyMemory } from "@mimitales/story-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaStoryRepo } from "./prisma-repo";
import { MAX_STORIES_PER_CHILD, type NewStory } from "./repo";

const repo = new PrismaStoryRepo(prisma);
const memory = emptyMemory({
  world: "Enchanted Forest",
  currentLocation: "Crystal Cave",
  mainCharacter: "Mia",
});

let parentA = "";
let parentB = "";
let childA = "";

const newStory = (): NewStory => ({
  childId: childA,
  characterSlug: "lumi",
  worldSlug: "enchanted-forest",
  language: "en-IN",
  title: "Integration test story",
  memory,
});

beforeAll(async () => {
  const stamp = Date.now();
  const a = await prisma.parentAccount.create({
    data: { email: `it-a-${stamp}@example.test`, passwordHash: "x" },
    select: { id: true },
  });
  const b = await prisma.parentAccount.create({
    data: { email: `it-b-${stamp}@example.test`, passwordHash: "x" },
    select: { id: true },
  });
  const child = await prisma.childProfile.create({
    data: { parentId: a.id, displayName: "Mia", ageBand: "AGE_5_6" },
    select: { id: true },
  });
  parentA = a.id;
  parentB = b.id;
  childA = child.id;
});

afterAll(async () => {
  // Cascades remove children, stories, memory and episodes.
  await prisma.parentAccount.deleteMany({ where: { id: { in: [parentA, parentB] } } });
  await prisma.$disconnect();
});

describe("PrismaStoryRepo (real Postgres)", () => {
  it("creates a story with its initial memory, and refuses another parent's child", async () => {
    const created = await repo.create(parentA, newStory());
    if (typeof created === "string") throw new Error(`unexpected ${created}`);
    expect(created).toMatchObject({ characterSlug: "lumi", worldSlug: "enchanted-forest", episodeCount: 0 });

    const context = await repo.loadContext(parentA, created.id);
    expect(context?.version).toBe(1);
    expect(context?.memory.currentLocation).toBe("Crystal Cave");
    expect(context?.latestEpisode).toBeNull();

    expect(await repo.create(parentB, newStory())).toBe("NOT_FOUND");
    await repo.remove(parentA, created.id);
  });

  it("saves with a version check, opens and closes episodes, and rejects stale saves", async () => {
    const created = await repo.create(parentA, newStory());
    if (typeof created === "string") throw new Error(`unexpected ${created}`);

    const first = await repo.commit(parentA, created.id, {
      expectedVersion: 1,
      memory: { ...memory, mission: "Find the moon crystal" },
      openEpisode: true,
    });
    expect(first).toEqual({ status: "ok", episodeNumber: 1 });

    // A second writer that still holds version 1 loses.
    const stale = await repo.commit(parentA, created.id, {
      expectedVersion: 1,
      memory: { ...memory, mission: "Overwritten!" },
      openEpisode: false,
    });
    expect(stale).toEqual({ status: "conflict" });

    const context = await repo.loadContext(parentA, created.id);
    expect(context?.version).toBe(2);
    expect(context?.memory.mission).toBe("Find the moon crystal");
    expect(context?.latestEpisode).toMatchObject({ episodeNumber: 1, ended: false });

    const closed = await repo.commit(parentA, created.id, {
      expectedVersion: 2,
      memory,
      openEpisode: false,
      closeEpisode: { id: context?.latestEpisode?.id ?? "", summary: "Mia searched the cave." },
    });
    expect(closed.status).toBe("ok");
    const after = await repo.loadContext(parentA, created.id);
    expect(after?.latestEpisode).toMatchObject({ summary: "Mia searched the cave.", ended: true });
    await repo.remove(parentA, created.id);
  });

  it("never lets another parent read, save or delete a story", async () => {
    const created = await repo.create(parentA, newStory());
    if (typeof created === "string") throw new Error(`unexpected ${created}`);

    expect(await repo.get(parentB, created.id)).toBeNull();
    expect(await repo.loadContext(parentB, created.id)).toBeNull();
    expect(
      await repo.commit(parentB, created.id, { expectedVersion: 1, memory, openEpisode: true }),
    ).toEqual({ status: "conflict" });
    expect(await repo.remove(parentB, created.id)).toBe(false);
    expect(await repo.get(parentA, created.id)).not.toBeNull();
    await repo.remove(parentA, created.id);
  });

  it("enforces the per-child story limit", async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_STORIES_PER_CHILD; i++) {
      const created = await repo.create(parentA, newStory());
      if (typeof created === "string") throw new Error(`unexpected ${created}`);
      ids.push(created.id);
    }
    expect(await repo.create(parentA, newStory())).toBe("LIMIT_REACHED");
    for (const id of ids) await repo.remove(parentA, id);
  });

  it("deletes memory and episodes together with the story", async () => {
    const created = await repo.create(parentA, newStory());
    if (typeof created === "string") throw new Error(`unexpected ${created}`);
    await repo.commit(parentA, created.id, { expectedVersion: 1, memory, openEpisode: true });
    await repo.remove(parentA, created.id);
    expect(await prisma.storyMemory.count({ where: { storyId: created.id } })).toBe(0);
    expect(await prisma.storyEpisode.count({ where: { storyId: created.id } })).toBe(0);
  });
});