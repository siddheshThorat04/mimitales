export interface ParentRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface AuthRepo {
  findParentByEmail(email: string): Promise<ParentRecord | null>;
  findParentById(id: string): Promise<{ id: string; email: string } | null>;
  createParent(input: { email: string; passwordHash: string }): Promise<ParentRecord | "EMAIL_TAKEN">;
  audit(action: string, parentId: string | null, requestId: string): Promise<void>;
}