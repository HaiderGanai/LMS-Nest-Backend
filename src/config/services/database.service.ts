import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(@InjectConnection() private readonly mongoConnection: Connection) {}

  async onModuleInit(): Promise<void> {
    if (this.mongoConnection.readyState !== 1) {
      await this.mongoConnection.asPromise();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.mongoConnection.readyState !== 0) {
      await this.mongoConnection.close();
    }
  }

  getConnectionState(): Record<string, unknown> {
    return {
      readyState: this.mongoConnection.readyState,
      host: this.mongoConnection.host,
      name: this.mongoConnection.name,
    };
  }
}
