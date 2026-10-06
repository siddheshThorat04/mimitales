import { Prisma, type AgeBand as DbAgeBand, type PrismaClient } from "@mimitales/database";
import type { AgeBand } from "@mimitales/shared";
import {
  MAX_CHILDREN_PER_PARENT,
  type ChildPatch,
  type ChildRecord,
  type ChildRepo,
  type NewChild,
} from "./repo";

const TO_DB: Record<AgeBand, DbAgeBand> = {
  "3-4": "AGE_3_4",
  "5-6": "AGE_5_6",
  "7-8": "AGE_7_8",
  "9-10": "AGE_9_10",
};

const FROM_DB: Record<DbAgeBand, AgeBand> = {
  AGE_3_4: "3-4",
  AGE_5_6: "5-6",
  AGE_7_8: "7-8",
  AGE_9_10: "9-10",
};

const SELECT = {
  id: true,
  displayName: true,
  ageBand: true,
  preferredLanguage: true,
  createdAt: true,
} as const;

interface Row {
  id: string;
  displayName: string;
  ageBand: DbAgeBand;
  preferredLanguage: string;
  createdAt: Date;
}

const toRecord = (row: Row): ChildRecord => ({ ...row, ageBand: FROM_DB[row.ageBand] });

export class PrismaChildRepo implements ChildRepo {
  constructor(private readonly db: PrismaClient) {}

  async list(parentId: string) {
    const rows = await this.db.childProfile.findMany({
      where: { parentId },
      select: SELECT,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRecord);
  }

  async create(parentId: string, input: NewChild): Promise<ChildRecord | "LIMIT_REACHED"> {
    return this.db.$transaction(async (tx) => {
      // Lock the parent row so concurrent requests can't both pass the limit check.
      await tx.$queryRaw`SELECT id FROM parent_accounts WHERE id = ${parentId}::uuid FOR UPDATE`;
      const count = await tx.childProfile.count({ where: { parentId } });
      if (count >= MAX_CHILDREN_PER_PARENT) return "LIMIT_REACHED" as const;
      const row = await tx.childProfile.create({
        data: {
          parentId,
          displayName: input.displayName,
          ageBand: TO_DB[input.ageBand],
          preferredLanguage: input.preferredLanguage,
        },
        select: SELECT,
      });
      return toRecord(row);
    });
  }

  async update(parentId: string, id: string, patch: ChildPatch) {
    const data: Prisma.ChildProfileUpdateInput = {};
    if (patch.displayName !== undefined) data.displayName = patch.displayName;
    if (patch.ageBand !== undefined) data.ageBand = TO_DB[patch.ageBand];
    if (patch.preferredLanguage !== undefined) data.preferredLanguage = patch.preferredLanguage;
    try {
      // The parentId in the where clause makes ownership part of the same atomic query.
      const row = await this.db.childProfile.update({
        where: { id, parentId },
        data,
        select: SELECT,
      });
      return toRecord(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
      throw err;
    }
  }

  async remove(parentId: string, id: string) {
    const { count } = await this.db.childProfile.deleteMany({ where: { id, parentId } });
    return count > 0;
  }
}