import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

interface ProcessJob {
  jobId: string;
  callId: string;
  mode: string;
  status: string;
  requestedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
}

@Injectable()
export class RecordingProcessingService {
  /** In-memory job map — mirrors recordingProcessJobs in the reference server */
  private readonly jobs = new Map<string, ProcessJob>();

  constructor(
    @InjectModel('CallRecording')
    private readonly callRecordingModel: Model<Record<string, unknown>>,
    @InjectModel('ProcessingQueue')
    private readonly processingQueueModel: Model<Record<string, unknown>>,
  ) {}

  async processRecording(
    callId: string,
    mode = 'combined',
  ): Promise<{
    success: boolean;
    queued: boolean;
    reused: boolean;
    callId: string;
    mode: string;
    jobId: string;
    status: string;
    requestedAt: string;
  }> {
    const recDoc = await this.callRecordingModel.findById(callId).lean();
    if (!recDoc) {
      throw new NotFoundException(`Recording not found for callId=${callId}`);
    }

    const existing = this.jobs.get(callId);
    if (existing && existing.status === 'pending') {
      return {
        success: true,
        queued: true,
        reused: true,
        callId,
        mode: existing.mode,
        jobId: existing.jobId,
        status: existing.status,
        requestedAt: existing.requestedAt,
      };
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const requestedAt = new Date().toISOString();
    const job: ProcessJob = { jobId, callId, mode, status: 'pending', requestedAt, startedAt: null, completedAt: null, error: null };

    this.jobs.set(callId, job);

    await this.processingQueueModel.updateOne(
      { _id: callId },
      {
        $set: {
          _id: callId,
          jobId,
          mode,
          status: 'pending',
          requestedAt,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );

    return {
      success: true,
      queued: true,
      reused: false,
      callId,
      mode: job.mode,
      jobId: job.jobId,
      status: job.status,
      requestedAt: job.requestedAt,
    };
  }

  async getProcessingStatus(callId: string): Promise<{
    success: boolean;
    callId: string;
    job: Omit<ProcessJob, 'callId'> | null;
    persisted: Record<string, unknown> | null;
  }> {
    const job = this.jobs.get(callId) || null;

    const doc = await this.callRecordingModel.findById(callId).lean() as Record<string, unknown> | null;
    const persisted = doc
      ? {
          status: doc.status || null,
          processingError: doc.processingError || null,
          playbackUrl: doc.playbackUrl || null,
          processedAt: doc.processedAt || null,
          playbackUpdatedAt: doc.playbackUpdatedAt || null,
        }
      : null;

    return {
      success: true,
      callId,
      job: job
        ? {
            jobId: job.jobId,
            mode: job.mode,
            status: job.status,
            requestedAt: job.requestedAt,
            startedAt: job.startedAt || null,
            completedAt: job.completedAt || null,
            error: job.error || null,
          }
        : null,
      persisted,
    };
  }

  async deleteRecording(callId: string): Promise<{
    success: boolean;
    callId: string;
  }> {
    // Mark deleted in DB
    await this.callRecordingModel.updateOne(
      { _id: callId },
      { $set: { deleted: true, deletedAt: new Date().toISOString() } },
    );
    // Remove from processing queue
    await this.processingQueueModel.deleteOne({ _id: callId });
    // Remove from in-memory jobs
    this.jobs.delete(callId);

    return { success: true, callId };
  }

  async batchDeleteRecordings(callIds: string[]): Promise<{
    success: boolean;
    total: number;
    deleted: number;
    failed: number;
    results: Array<{ callId: string; success: boolean; error?: string }>;
  }> {
    const deduped = [...new Set(callIds.filter(Boolean))];
    if (!deduped.length) {
      throw new BadRequestException('callIds array is required');
    }

    const results: Array<{ callId: string; success: boolean; error?: string }> = [];

    for (const callId of deduped) {
      try {
        await this.deleteRecording(callId);
        results.push({ callId, success: true });
      } catch (err) {
        results.push({
          callId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete recording',
        });
      }
    }

    const deleted = results.filter((r) => r.success).length;
    const failed = results.length - deleted;

    return {
      success: failed === 0,
      total: results.length,
      deleted,
      failed,
      results,
    };
  }

  async processPendingRecordings(): Promise<void> {
    const pending = await this.processingQueueModel
      .find({ status: 'pending' })
      .select({ _id: 1 })
      .lean() as Record<string, unknown>[];
    for (const item of pending) {
      try {
        await this.processRecording(String(item['_id']));
      } catch {
        // continue processing others on failure
      }
    }
  }
}
