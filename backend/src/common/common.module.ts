import { Global, Module } from '@nestjs/common';
import { InMemoryStoreService } from './in-memory-store.service';

@Global()
@Module({
  providers: [InMemoryStoreService],
  exports: [InMemoryStoreService],
})
export class CommonModule {}
