export interface AbStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface AbAssignment {
  variant: string | null;
  enrolled: boolean;
  source: 'server' | 'cache' | 'default';
}

export interface AbClient {
  assign(
    keys: string[],
    options?: { enroll?: string[]; payload?: Record<string, unknown> },
  ): Promise<Record<string, AbAssignment>>;
}

export function createAbClient(options: {
  endpoint: string;
  storage: AbStorage;
  timeoutMs?: number;
  defaults?: Record<string, string>;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}): AbClient;
