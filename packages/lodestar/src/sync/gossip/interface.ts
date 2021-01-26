export type IGossipHandler = {
  start(): Promise<void>;
  stop(): void;
  handleSyncCompleted(): void;
};
