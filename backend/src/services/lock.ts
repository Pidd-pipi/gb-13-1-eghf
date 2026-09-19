/**
 * 进程内键控异步互斥锁。
 *
 * 作用：把对同一资源（一本书、一张求购单、一笔交易）的并发写操作在应用层串行化，
 * 与数据库条件更新（WHERE status=...）和唯一索引共同构成三道防线。
 * 单实例部署下足以保证「并发抢同一本书只能成功一次」；
 * 多实例部署时数据库的行锁/条件更新与唯一索引仍为最终正确性保证。
 */
class KeyedLock {
  private tails = new Map<string, Promise<unknown>>();

  /** 对单个 key 加锁执行 */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(key, previous.then(() => current));
    await previous;
    try {
      return await fn();
    } finally {
      release();
      // 无后续等待者时回收该 key
      const tail = this.tails.get(key);
      tail?.then(() => {
        if (this.tails.get(key) === tail) this.tails.delete(key);
      });
    }
  }

  /**
   * 按字典序依次获取多把锁后执行（统一加锁顺序，杜绝多锁死锁）。
   * 资源命名空间：book:<id>、request:<id>、transaction:<id>。
   */
  async withLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    const sortedKeys = [...new Set(keys)].sort();
    const run = (index: number): Promise<T> => {
      if (index >= sortedKeys.length) return fn();
      return this.withLock(sortedKeys[index], () => run(index + 1));
    };
    return run(0);
  }
}

export const keyedLock = new KeyedLock();
