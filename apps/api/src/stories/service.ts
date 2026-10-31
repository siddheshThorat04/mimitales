import { isLanguageCode, type LanguageCode } from "@mimitales/shared";
import {
  characterConfigSchema,
  emptyMemory,
  sanitizeChildText,
  worldConfigSchema,
  type CharacterConfig,
  type PromptContext,
  type RecentTurn,
  type StoryEngine,
  type StoryMemory,
  type TurnKind,
  type TurnResult,
  type WorldConfig,
} from "@mimitales/story-engine";
import type { CatalogRepo } from "../catalog/repo";
import type { ChildRepo } from "../children/repo";
import type { TurnHistory } from "./history";
import type { EpisodeInfo, StoryContext, StoryRepo, StoryRow } from "./repo";

export interface StoryDeps {
  repo: StoryRepo;
  engine: StoryEngine;
  history: TurnHistory;
}

interface ServiceDeps extends StoryDeps {
  children: ChildRepo;
  catalog: CatalogRepo;
}

export type Fail = { ok: false; status: 400 | 404 | 409; error: string };
export type Result<T> = { ok: true; value: T } | Fail;
const fail = (status: Fail["status"], error: string): Fail => ({ ok: false, status, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export interface CreateStoryInput {
  childId: string;
  characterSlug: string;
  worldSlug?: string;
  language?: string;
}

export interface TurnOutcome {
  narration: string;
  episodeNumber: number | null;
  episodeEnded: boolean;
  degraded: boolean;
  /** Internal only: logged by the route, never sent to the client. */
  reason?: string;
}

/** What parents may see. No child choices, events or facts. */
export interface ParentMemoryView {
  world: string;
  currentLocation: string;
  mission: string;
  currentProblem: string;
  nextGoal: string;
  friends: string[];
  inventory: string[];
  lastSceneSummary: string;
}

export function toParentMemoryView(m: StoryMemory): ParentMemoryView {
  return {
    world: m.world,
    currentLocation: m.currentLocation,
    mission: m.mission,
    currentProblem: m.currentProblem,
    nextGoal: m.nextGoal,
    friends: m.friends,
    inventory: m.inventory,
    lastSceneSummary: m.lastSceneSummary,
  };
}

/**
 * The name the story calls its hero. This is sent to the LLM provider.
 * Swap in a neutral name here if you decide not to share the nickname.
 */
export const heroName = (displayName: string) => displayName;

interface Loaded {
  data: StoryContext;
  promptCtx: PromptContext;
  world: WorldConfig;
}

type FailedTurn = Extract<TurnResult, { ok: false }>;
type SuccessfulTurn = Extract<TurnResult, { ok: true }>;

const degradedOutcome = (result: FailedTurn, latest: EpisodeInfo | null): TurnOutcome => ({
  narration: result.fallbackNarration,
  episodeNumber: latest?.episodeNumber ?? null,
  episodeEnded: false,
  degraded: true,
  reason: result.reason,
});

export class StoryService {
  constructor(private readonly deps: ServiceDeps) {}

  private async findCharacter(slug: string): Promise<CharacterConfig | null> {
    const row = (await this.deps.catalog.listCharacters()).find((r) => r.slug === slug);
    const parsed = row ? characterConfigSchema.safeParse(row.config) : null;
    return parsed?.success ? parsed.data : null;
  }

  private async findWorld(slug: string): Promise<WorldConfig | null> {
    const row = (await this.deps.catalog.listWorlds()).find((r) => r.slug === slug);
    const parsed = row ? worldConfigSchema.safeParse(row.config) : null;
    return parsed?.success ? parsed.data : null;
  }

  async create(parentId: string, input: CreateStoryInput): Promise<Result<StoryRow>> {
    const child = (await this.deps.children.list(parentId)).find((c) => c.id === input.childId);
    if (!child) return fail(404, "CHILD_NOT_FOUND");

    const character = await this.findCharacter(input.characterSlug);
    if (!character) return fail(400, "UNKNOWN_CHARACTER");
    const worldSlug = input.worldSlug ?? character.defaultWorld;
    if (!character.worlds.includes(worldSlug)) return fail(400, "WORLD_NOT_AVAILABLE");
    const world = await this.findWorld(worldSlug);
    if (!world) return fail(400, "WORLD_NOT_AVAILABLE");
    if (!character.ageBands.includes(child.ageBand)) return fail(400, "AGE_NOT_SUPPORTED");

    const memory = emptyMemory({
      world: world.name,
      currentLocation: world.locations[0]?.name ?? world.name,
      mainCharacter: heroName(child.displayName),
    });
    const created = await this.deps.repo.create(parentId, {
      childId: child.id,
      characterSlug: character.slug,
      worldSlug: world.slug,
      language: input.language ?? child.preferredLanguage,
      title: `${character.name} in the ${world.name}`,
      memory,
    });
    if (created === "LIMIT_REACHED") return fail(409, "LIMIT_REACHED");
    if (created === "NOT_FOUND") return fail(404, "NOT_FOUND");
    return ok(created);
  }

  list(parentId: string, childId?: string) {
    return this.deps.repo.list(parentId, childId);
  }

  async get(parentId: string, id: string): Promise<Result<StoryRow>> {
    const story = await this.deps.repo.get(parentId, id);
    return story ? ok(story) : fail(404, "NOT_FOUND");
  }

  async remove(parentId: string, id: string): Promise<Result<true>> {
    if (!(await this.deps.repo.remove(parentId, id))) return fail(404, "NOT_FOUND");
    await this.deps.history.clear(id);
    return ok(true);
  }

  async memoryView(parentId: string, id: string) {
    const data = await this.deps.repo.loadContext(parentId, id);
    if (!data) return fail(404, "NOT_FOUND");
    return ok({ memory: toParentMemoryView(data.memory), episodeCount: data.story.episodeCount });
  }

  private async load(parentId: string, storyId: string): Promise<Result<Loaded>> {
    const data = await this.deps.repo.loadContext(parentId, storyId);
    if (!data) return fail(404, "NOT_FOUND");
    if (data.story.status !== "ACTIVE") return fail(409, "STORY_NOT_ACTIVE");

    const child = (await this.deps.children.list(parentId)).find((c) => c.id === data.story.childId);
    if (!child) return fail(404, "NOT_FOUND");
    const [character, world] = await Promise.all([
      this.findCharacter(data.story.characterSlug),
      this.findWorld(data.story.worldSlug),
    ]);
    if (!character || !world) return fail(409, "CONTENT_UNAVAILABLE");

    const language: LanguageCode = isLanguageCode(data.story.language) ? data.story.language : "en-IN";
    const recentTurns = await this.deps.history.get(storyId);
    return ok({
      data,
      world,
      promptCtx: { character, world, language, ageBand: child.ageBand, memory: data.memory, recentTurns },
    });
  }

  /** `start` begins episode 1. `continue` resumes an open episode or opens the next one. */
  async begin(
    parentId: string,
    storyId: string,
    mode: "start" | "continue",
  ): Promise<Result<TurnOutcome>> {
    const loaded = await this.load(parentId, storyId);
    if (!loaded.ok) return loaded;
    const { data, promptCtx, world } = loaded.value;
    const latest = data.latestEpisode;
    if (mode === "start" && latest) return fail(409, "ALREADY_STARTED");
    if (mode === "continue" && !latest) return fail(409, "NOT_STARTED");

    const resuming = latest !== null && !latest.ended;
    const hook =
      world.storyHooks[Math.floor(Math.random() * world.storyHooks.length)] ??
      world.description["en-IN"];
    const kind: TurnKind =
      mode === "start"
        ? { type: "start", hook }
        : {
            type: "continue",
            previousEpisodeSummary: latest?.ended ? latest.summary || undefined : undefined,
          };

    const result = await this.deps.engine.takeTurn(promptCtx, kind);
    if (!result.ok) return ok(degradedOutcome(result, latest));
    return this.finish(parentId, storyId, loaded.value, result, {
      openEpisode: !resuming,
      childText: null,
    });
  }

  async childTurn(parentId: string, storyId: string, text: string): Promise<Result<TurnOutcome>> {
    const loaded = await this.load(parentId, storyId);
    if (!loaded.ok) return loaded;
    const latest = loaded.value.data.latestEpisode;
    if (!latest || latest.ended) return fail(409, "NO_OPEN_EPISODE");

    const result = await this.deps.engine.takeTurn(loaded.value.promptCtx, { type: "child", text });
    if (!result.ok) return ok(degradedOutcome(result, latest));
    return this.finish(parentId, storyId, loaded.value, result, {
      openEpisode: false,
      childText: sanitizeChildText(text),
    });
  }

  async endEpisode(parentId: string, storyId: string): Promise<Result<true>> {
    const loaded = await this.load(parentId, storyId);
    if (!loaded.ok) return loaded;
    const { data, promptCtx } = loaded.value;
    const latest = data.latestEpisode;
    if (!latest || latest.ended) return fail(409, "NO_OPEN_EPISODE");

    const closed = await this.deps.engine.closeEpisode(promptCtx);
    const committed = await this.deps.repo.commit(parentId, storyId, {
      expectedVersion: data.version,
      memory: closed.memory,
      openEpisode: false,
      closeEpisode: { id: latest.id, summary: closed.summary },
    });
    if (committed.status === "conflict") return fail(409, "CONFLICT");
    await this.deps.history.clear(storyId);
    return ok(true);
  }

  private async finish(
    parentId: string,
    storyId: string,
    loaded: Loaded,
    result: SuccessfulTurn,
    opts: { openEpisode: boolean; childText: string | null },
  ): Promise<Result<TurnOutcome>> {
    const { data, promptCtx } = loaded;
    const newTurns: RecentTurn[] = [];
    if (opts.childText) newTurns.push({ role: "child", text: opts.childText });
    newTurns.push({ role: "character", text: result.narration });

    let memory = result.memory;
    let closeEpisode: { id: string; summary: string } | undefined;
    const open = data.latestEpisode && !data.latestEpisode.ended ? data.latestEpisode : null;
    // Only an episode that already exists can be closed (a brand-new one is closed on a later turn).
    if (result.episodeShouldEnd && !opts.openEpisode && open) {
      const closed = await this.deps.engine.closeEpisode({
        ...promptCtx,
        memory,
        recentTurns: [...promptCtx.recentTurns, ...newTurns],
      });
      memory = closed.memory;
      closeEpisode = { id: open.id, summary: closed.summary };
    }

    const committed = await this.deps.repo.commit(parentId, storyId, {
      expectedVersion: data.version,
      memory,
      openEpisode: opts.openEpisode,
      closeEpisode,
    });
    if (committed.status === "conflict") return fail(409, "CONFLICT");

    // History is best-effort: losing it only shortens the model's short-term context.
    try {
      if (closeEpisode) await this.deps.history.clear(storyId);
      else await this.deps.history.append(storyId, newTurns);
    } catch {
      // ignore
    }

    return ok({
      narration: result.narration,
      episodeNumber: committed.episodeNumber ?? data.latestEpisode?.episodeNumber ?? null,
      episodeEnded: closeEpisode !== undefined,
      degraded: false,
    });
  }
}