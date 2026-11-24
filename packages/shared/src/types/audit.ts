import type { ActorType } from "../constants";

export interface AuditDiffEntry {
  path: string;
  before: unknown;
  after: unknown;
}

export interface AuditEntryDTO {
  id: string;
  guildId: string | null;
  actorId: string;
  actorType: ActorType;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
  revertedAt: string | null;
}

export interface AuditQuery {
  guildId?: string;
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}
