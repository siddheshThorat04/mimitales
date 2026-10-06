import { Prisma, type PrismaClient } from "@mimitales/database";
import type { AuthRepo, ParentRecord } from "./repo";

export class PrismaAuthRepo implements AuthRepo {
  constructor(private readonly db: PrismaClient) {}

  findParentByEmail(email: string) {
    return this.db.parentAccount.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  }

  findParentById(id: string) {
    return this.db.parentAccount.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
  }

  async createParent(input: {
    email: string;
    passwordHash: string;
  }): Promise<ParentRecord | "EMAIL_TAKEN"> {
    try {
      // Nested creates run in one transaction: account + default controls + empty wallet.
      return await this.db.parentAccount.create({
        data: { ...input, controls: { create: {} }, wallet: { create: {} } },
        select: { id: true, email: true, passwordHash: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return "EMAIL_TAKEN";
      }
      throw err;
    }
  }

  async audit(action: string, parentId: string | null, requestId: string) {
    await this.db.auditLog.create({ data: { action, parentId, requestId } });
  }
}