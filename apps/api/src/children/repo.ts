import type { AgeBand } from "@mimitales/shared";

export const MAX_CHILDREN_PER_PARENT = 5;

export interface ChildRecord {
  id: string;
  displayName: string;
  ageBand: AgeBand;
  preferredLanguage: string;
  createdAt: Date;
}

export interface NewChild {
  displayName: string;
  ageBand: AgeBand;
  preferredLanguage: string;
}

export interface ChildPatch {
  displayName?: string;
  ageBand?: AgeBand;
  preferredLanguage?: string;
}

/**
 * Every method takes the parent's id and scopes by it.
 * There is deliberately no "find by child id alone".
 */
export interface ChildRepo {
  list(parentId: string): Promise<ChildRecord[]>;
  create(parentId: string, input: NewChild): Promise<ChildRecord | "LIMIT_REACHED">;
  update(parentId: string, id: string, patch: ChildPatch): Promise<ChildRecord | null>;
  remove(parentId: string, id: string): Promise<boolean>;
}