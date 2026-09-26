import { Injectable } from '@angular/core';

type RapierModule = typeof import('@dimforge/rapier3d-compat').default;

@Injectable({ providedIn: 'root' })
export class RapierLoaderService {
  private modulePromise?: Promise<RapierModule>;

  load(): Promise<RapierModule> {
    this.modulePromise ??= import('@dimforge/rapier3d-compat').then(async (module) => {
      await module.default.init();
      return module.default;
    });

    return this.modulePromise;
  }

  getRapier(): Promise<RapierModule> {
    return this.load();
  }
}