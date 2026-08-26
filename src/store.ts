import { emptyProject, nowIso, type Project } from './types';

type Listener = () => void;

class Store {
  project: Project = emptyProject();
  private listeners: Set<Listener> = new Set();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.project.updatedAt = nowIso();
    this.listeners.forEach((fn) => fn());
  }

  /** 状態を書き換えるための唯一の入口。mutator内でprojectを直接書き換える。 */
  update(mutator: (p: Project) => void): void {
    mutator(this.project);
    this.notify();
  }

  replaceProject(p: Project): void {
    this.project = p;
    this.notify();
  }

  reset(): void {
    this.project = emptyProject();
    this.notify();
  }
}

export const store = new Store();
