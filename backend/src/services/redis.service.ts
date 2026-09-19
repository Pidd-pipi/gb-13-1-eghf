import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

class RedisService {
  private client: RedisClientType;

  async connect(): Promise<void> {
    this.client = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      password: config.redis.password,
      // 连接失败时不无限重试，避免 connect() 的 Promise 永不结算而阻塞服务启动
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: (retries) => (retries > 2 ? new Error('Redis 不可用，停止重连') : 200),
      },
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));

    try {
      // 兜底超时：无论重试策略如何，最多等待 3 秒
      await Promise.race([
        this.client.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis 连接超时')), 3000),
        ),
      ]);
      console.log('Redis connected successfully');
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      throw err;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, seconds?: number): Promise<void> {
    if (!this.client) return;
    if (seconds) {
      await this.client.set(key, value, { EX: seconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }
}

export const redisService = new RedisService();
