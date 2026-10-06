import type { AgeBand } from "@mimitales/shared";

export interface Child {
  id: string;
  displayName: string;
  ageBand: AgeBand;
  preferredLanguage: string;
}