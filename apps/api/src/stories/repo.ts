import type { StoryMemory } from "@mimitales/story-engine";

export const MAX_STORIES_PER_CHILD = 10;

export type StoryStatusName = "ACTIVE" | "PAUSED" | "COMPLETED";

export interface StoryRow {
  id: string;
  childId: string;
  characterSlug: string;
  worldSlug: string;
  language: string;
  title: string;
  status: StoryStatusName;
  episodeCount: number;
  createdAt: Date;
}

export interface NewStory {
  childId: string;
  characterSlug: string;
  worldSlug: string;
  language: string;
  title: string;
  memory: StoryMemory;
}

export interface EpisodeInfo {
  id: string;
  episodeNumber: number;
  summary: string;
  ended: boolean;
}

export interface StoryContext {
  story: StoryRow;
  memory: StoryMemory;
  version: number;
  latestEpisode: EpisodeInfo | null;
}

export interface StoryCommit {
  expectedVersion: number;
  memory: StoryMemory;
  openEpisode: boolean;
  closeEpisode?: { id: string; summary: string };
}

export type CommitResult = { status: "ok"; episodeNumber: number | null } | { status: "conflict" };

/** Every method takes the parent's id and scopes by it. */
export interface StoryRepo {
  create(parentId: string, input: NewStory): Promise<StoryRow | "LIMIT_REACHED" | "NOT_FOUND">;
  list(parentId: string, childId?: string): Promise<StoryRow[]>;
  get(parentId: string, id: string): Promise<StoryRow | null>;
  remove(parentId: string, id: string): Promise<boolean>;
  loadContext(parentId: string, id: string): Promise<StoryContext | null>;
  /** Saves memory (conditional on the version) and opens or closes an episode, atomically. */
  commit(parentId: string, storyId: string, change: StoryCommit): Promise<CommitResult>;
}