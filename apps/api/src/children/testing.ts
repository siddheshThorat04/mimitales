import { randomUUID } from "node:crypto";
import {
  MAX_CHILDREN_PER_PARENT,
  type ChildPatch,
  type ChildRecord,
  type ChildRepo,
  type NewChild,
} from "./repo";

interface StoredChild extends ChildRecord {
  parentId: string;
}

const toRecord = (c: StoredChild): ChildRecord => ({
  id: c.id,
  displayName: c.displayName,
  ageBand: c.ageBand,
  preferredLanguage: c.preferredLanguage,
  createdAt: c.createdAt,
});

export class MemoryChildRepo implements ChildRepo {
  private readonly rows = new Map<string, StoredChild>();

  async list(parentId: string) {
    return [...this.rows.values()].filter((c) => c.parentId === parentId).map(toRecord);
  }

  async create(parentId: string, input: NewChild) {
    const owned = [...this.rows.values()].filter((c) => c.parentId === parentId);
    if (owned.length >= MAX_CHILDREN_PER_PARENT) return "LIMIT_REACHED" as const;
    const row: StoredChild = { id: randomUUID(), parentId, createdAt: new Date(), ...input };
    this.rows.set(row.id, row);
    return toRecord(row);
  }

  async update(parentId: string, id: string, patch: ChildPatch) {
    const row = this.rows.get(id);
    if (!row || row.parentId !== parentId) return null;
    if (patch.displayName !== undefined) row.displayName = patch.displayName;
    if (patch.ageBand !== undefined) row.ageBand = patch.ageBand;
    if (patch.preferredLanguage !== undefined) row.preferredLanguage = patch.preferredLanguage;
    return toRecord(row);
  }

  async remove(parentId: string, id: string) {
    const row = this.rows.get(id);
    if (!row || row.parentId !== parentId) return false;
    this.rows.delete(id);
    return true;
  }
}