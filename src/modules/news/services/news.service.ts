import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NewsService {
  constructor(
    @InjectModel('NewsItem')
    private readonly newsModel: Model<any>,
  ) {}

  async list(query: { limit?: string; skip?: string }) {
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const skip = parseInt(query.skip || '0', 10);
    const items = await this.newsModel.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const total = await this.newsModel.countDocuments({});
    return { news: items, total };
  }

  async count() {
    return { count: await this.newsModel.countDocuments({}) };
  }

  async create(body: any, uid: string) {
    const item = await this.newsModel.create({
      _id: uuidv4(),
      title: body.title,
      body: body.body || '',
      createdBy: uid,
    });
    return { news: item.toObject() };
  }

  async addNote(id: string, text: string, uid: string, uname?: string) {
    const note = { _id: uuidv4(), text, addedBy: uid, addedByName: uname || '', createdAt: new Date() };
    const item = await this.newsModel.findByIdAndUpdate(
      id,
      { $push: { notes: note } },
      { new: true },
    ).lean();
    if (!item) throw new NotFoundException('News item not found');
    return { news: item };
  }

  async removeNote(id: string, noteId: string) {
    const item = await this.newsModel.findByIdAndUpdate(
      id,
      { $pull: { notes: { _id: noteId } } },
      { new: true },
    ).lean();
    if (!item) throw new NotFoundException('News item not found');
    return { news: item };
  }

  async remove(id: string) {
    const result = await this.newsModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new NotFoundException('News item not found');
    return { success: true };
  }
}
