import { randomUUID } from "node:crypto";
import { ScriptedLLMProvider, type ScriptedReply } from "@mimitales/providers";
import { StoryEngine, type RecentTurn, type StoryMemory } from "@mimitales/story-engine";
import { HISTORY_MAX_TURNS, type TurnHistory } from "./history";
import {
  MAX_STORIES_PER_CHILD,
  type CommitResult,
  type NewStory,
  type StoryCommit,
  type StoryContext,
  type StoryRepo,
  type StoryRow,
} from "./repo";

interface StoredEpisode {
  id: string;
  episodeNumber: number;
  summary: string;
  ended: boolean;
}

interface StoredStory {
  parentId: string;
  row: Omit<StoryRow, "episodeCount">;
  memory: StoryMemory;
  version: number;
  episodes: StoredEpisode[];
}

/** In-memory twin of PrismaStoryRepo with the same rules. */
export class MemoryStoryRepo implements StoryRepo {
  private readonly stories = new Map<string, StoredStory>();

  private owned(parentId: string, id: string) {
    const s = this.stories.get(id);
    return s && s.parentId === parentId ? s : null;
  }

  private toRow(s: StoredStory): StoryRow {
    return { ...s.row, episodeCount: s.episodes.length };
  }

  async create(
    parentId: string,
    input: NewStory,
  ): Promise<StoryRow | "LIMIT_REACHED" | "NOT_FOUND"> {
    const forChild = [...this.stories.values()].filter(
      (s) => s.parentId === parentId && s.row.childId === input.childId,
    );
    if (forChild.length >= MAX_STORIES_PER_CHILD) return "LIMIT_REACHED";
    const stored: StoredStory = {
      parentId,
      row: {
        id: randomUUID(),
        childId: input.childId,
        characterSlug: input.characterSlug,
        worldSlug: input.worldSlug,
        language: input.language,
        title: input.title,
        status: "ACTIVE",
        createdAt: new Date(),
      },
      memory: structuredClone(input.memory),
      version: 1,
      episodes: [],
    };
    this.stories.set(stored.row.id, stored);
    return this.toRow(stored);
  }

  async list(parentId: string, childId?: string) {
    return [...this.stories.values()]
      .filter((s) => s.parentId === parentId && (!childId || s.row.childId === childId))
      .map((s) => this.toRow(s));
  }

  async get(parentId: string, id: string) {
    const s = this.owned(parentId, id);
    return s ? this.toRow(s) : null;
  }

  async remove(parentId: string, id: string) {
    return this.owned(parentId, id) ? this.stories.delete(id) : false;
  }

  async loadContext(parentId: string, id: string): Promise<StoryContext | null> {
    const s = this.owned(parentId, id);
    if (!s) return null;
    const latest = s.episodes.at(-1);
    return {
      story: this.toRow(s),
      memory: structuredClone(s.memory),
      version: s.version,
      latestEpisode: latest
        ? { id: latest.id, episodeNumber: latest.episodeNumber, summary: latest.summary, ended: latest.ended }
        : null,
    };
  }

  async commit(parentId: string, storyId: string, change: StoryCommit): Promise<CommitResult> {
    const s = this.owned(parentId, storyId);
    if (!s || s.version !== change.expectedVersion) return { status: "conflict" };
    s.memory = structuredClone(change.memory);
    s.version += 1;
    let episodeNumber: number | null = null;
    if (change.openEpisode) {
      episodeNumber = s.episodes.length + 1;
      s.episodes.push({ id: randomUUID(), episodeNumber, summary: "", ended: false });
    }
    const close = change.closeEpisode;
    if (close) {
      const episode = s.episodes.find((e) => e.id === close.id && !e.ended);
      if (episode) {
        episode.summary = close.summary;
        episode.ended = true;
      }
    }
    return { status: "ok", episodeNumber };
  }
}

export class MemoryTurnHistory implements TurnHistory {
  private readonly turns = new Map<string, RecentTurn[]>();

  async get(storyId: string) {
    return [...(this.turns.get(storyId) ?? [])];
  }

  async append(storyId: string, turns: RecentTurn[]) {
    const all = [...(this.turns.get(storyId) ?? []), ...turns];
    this.turns.set(storyId, all.slice(-HISTORY_MAX_TURNS));
  }

  async clear(storyId: string) {
    this.turns.delete(storyId);
  }
}

/** Story dependencies for tests. `llm` is exposed so tests can inspect every request. */
export function makeTestStories(replies: ScriptedReply[] = []) {
  const llm = new ScriptedLLMProvider(replies);
  return {
    llm,
    repo: new MemoryStoryRepo(),
    engine: new StoryEngine(llm),
    history: new MemoryTurnHistory(),
  };
}