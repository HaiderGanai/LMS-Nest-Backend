import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { NewsController } from './controllers/news.controller';
import { NewsItemModelName, NewsItemSchema } from './entities/news-item.entity';
import { NewsService } from './services/news.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([{ name: NewsItemModelName, schema: NewsItemSchema }]),
  ],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
