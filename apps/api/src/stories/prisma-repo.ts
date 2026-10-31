import { Prisma, type PrismaClient } from "@mimitales/database";
import { storyMemorySchema } from "@mimitales/story-engine";
import {
  MAX_STORIES_PER_CHILD,
  type CommitResult,
  type NewStory,
  type StoryCommit,
  type StoryContext,
  type StoryRepo,
  type StoryRow,
} from "./repo";

const STORY_SELECT = {
  id: true,
  childId: true,
  language: true,
  title: true,
  status: true,
  createdAt: true,
  character: { select: { slug: true } },
  world: { select: { slug: true } },
  _count: { select: { episodes: true } },
} as const;

type StoryDbRow = Prisma.StoryGetPayload<{ select: typeof STORY_SELECT }>;

const toRow = (s: StoryDbRow): StoryRow => ({
  id: s.id,
  childId: s.childId,
  characterSlug: s.character.slug,
  worldSlug: s.world.slug,
  language: s.language,
  title: s.title,
  status: s.status,
  episodeCount: s._count.episodes,
  createdAt: s.createdAt,
});

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;

export class PrismaStoryRepo implements StoryRepo {
  constructor(private readonly db: PrismaClient) {}

  async create(
    parentId: string,
    input: NewStory,
  ): Promise<StoryRow | "LIMIT_REACHED" | "NOT_FOUND"> {
    return this.db.$transaction(async (tx) => {
      // Lock the parent row so concurrent requests cannot both pass the limit check.
      await tx.$queryRaw`SELECT id FROM parent_accounts WHERE id = ${parentId}::uuid FOR UPDATE`;
      const [child, character, world] = await Promise.all([
        tx.childProfile.findFirst({ where: { id: input.childId, parentId }, select: { id: true } }),
        tx.character.findUnique({ where: { slug: input.characterSlug }, select: { id: true } }),
        tx.storyWorld.findUnique({ where: { slug: input.worldSlug }, select: { id: true } }),
      ]);
      if (!child || !character || !world) return "NOT_FOUND";
      const count = await tx.story.count({ where: { childId: child.id } });
      if (count >= MAX_STORIES_PER_CHILD) return "LIMIT_REACHED";
      const row = await tx.story.create({
        data: {
          parentId,
          childId: child.id,
          characterId: character.id,
          worldId: world.id,
          language: input.language,
          title: input.title,
          memory: { create: { state: toJson(input.memory) } },
        },
        select: STORY_SELECT,
      });
      return toRow(row);
    });
  }

  async list(parentId: string, childId?: string) {
    const rows = await this.db.story.findMany({
      where: { parentId, ...(childId ? { childId } : {}) },
      select: STORY_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toRow);
  }

  async get(parentId: string, id: string) {
    const row = await this.db.story.findFirst({
      where: { id, parentId },
      select: STORY_SELECT,
    });
    return row ? toRow(row) : null;
  }

  async remove(parentId: string, id: string) {
    const { count } = await this.db.story.deleteMany({ where: { id, parentId } });
    return count > 0;
  }

  async loadContext(parentId: string, id: string): Promise<StoryContext | null> {
    const s = await this.db.story.findFirst({
      where: { id, parentId },
      select: {
        ...STORY_SELECT,
        memory: { select: { state: true, version: true } },
        episodes: {
          orderBy: { episodeNumber: "desc" },
          take: 1,
          select: { id: true, episodeNumber: true, summary: true, endedAt: true },
        },
      },
    });
    if (!s?.memory) return null;
    const parsed = storyMemorySchema.safeParse(s.memory.state);
    // Corrupt memory is loud on purpose: never silently continue from broken state.
    if (!parsed.success) throw new Error("stored story memory failed validation");
    const latest = s.episodes[0];
    return {
      story: toRow(s),
      memory: parsed.data,
      version: s.memory.version,
      latestEpisode: latest
        ? {
            id: latest.id,
            episodeNumber: latest.episodeNumber,
            summary: latest.summary,
            ended: latest.endedAt !== null,
          }
        : null,
    };
  }

  async commit(parentId: string, storyId: string, change: StoryCommit): Promise<CommitResult> {
    try {
      return await this.db.$transaction(async (tx): Promise<CommitResult> => {
        // Ownership and the version check are part of the same atomic statement.
        const updated = await tx.storyMemory.updateMany({
          where: { storyId, version: change.expectedVersion, story: { parentId } },
          data: { state: toJson(change.memory), version: { increment: 1 } },
        });
        if (updated.count === 0) return { status: "conflict" };

        let episodeNumber: number | null = null;
        if (change.openEpisode) {
          const existing = await tx.storyEpisode.count({ where: { storyId } });
          const created = await tx.storyEpisode.create({
            data: { storyId, episodeNumber: existing + 1, summary: "" },
            select: { episodeNumber: true },
          });
          episodeNumber = created.episodeNumber;
        }
        if (change.closeEpisode) {
          await tx.storyEpisode.updateMany({
            where: { id: change.closeEpisode.id, storyId, endedAt: null },
            data: { summary: change.closeEpisode.summary, endedAt: new Date() },
          });
        }
        await tx.story.update({ where: { id: storyId }, data: { updatedAt: new Date() } });
        return { status: "ok", episodeNumber };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { status: "conflict" };
      }
      throw err;
    }
  }
}