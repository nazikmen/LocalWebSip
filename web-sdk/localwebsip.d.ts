export {};
declare global {
  interface LocalWebSipMockEvent {
    event: string;
    version: "1";
    eventId: string;
    data: Record<string, unknown>;
  }
  class LocalWebSipError extends Error { code: string; }
  class LocalWebSip {
    constructor(options?: { timeout?: number });
    request(command: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
    subscribe(listener: (event: LocalWebSipMockEvent) => void): () => void;
    close(): void;
    getInfo(): Promise<Record<string, unknown>>;
    getStatus(): Promise<Record<string, unknown>>;
    configureAccount(accountId: string, displayName?: string): Promise<Record<string, unknown>>;
    selectAccount(accountId: string): Promise<Record<string, unknown>>;
    register(): Promise<Record<string, unknown>>;
    unregister(): Promise<Record<string, unknown>>;
    dial(number: string): Promise<Record<string, unknown>>;
    answer(): Promise<Record<string, unknown>>;
    hangup(): Promise<Record<string, unknown>>;
    reject(): Promise<Record<string, unknown>>;
    mute(enabled: boolean): Promise<Record<string, unknown>>;
    hold(enabled: boolean): Promise<Record<string, unknown>>;
    getCallState(): Promise<Record<string, unknown>>;
    getCallHistory(): Promise<Record<string, unknown>>;
  }
}
