export type Updatable = {
  update(delta: number): void;
};

export type Disposable = {
  dispose(): void;
};

export type CameraConfigurable = {
  cameraConfig?: Partial<{ distance: number; height: number; lookOffset: number; smoothing: number }>;
};
