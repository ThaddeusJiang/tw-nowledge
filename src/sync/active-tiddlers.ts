export class ActiveTiddlerCoordinator {
  readonly #check: (title: string) => Promise<void>;
  #activeTitles = new Set<string>();

  public constructor(check: (title: string) => Promise<void>) {
    this.#check = check;
  }

  public async setActiveTitles(titles: string[]): Promise<void> {
    const nextTitles = new Set(titles);
    for (const title of nextTitles) {
      if (!this.#activeTitles.has(title)) {
        await this.#check(title);
      }
    }
    this.#activeTitles = nextTitles;
  }

  public async tiddlerChanged(title: string): Promise<void> {
    if (this.#activeTitles.has(title)) {
      await this.#check(title);
    }
  }
}
