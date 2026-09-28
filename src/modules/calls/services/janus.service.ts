import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { CALL_CONSTANTS } from '../constants/call.constants';
import type { JanusEvent } from '../interfaces/janus-event.interface';

@Injectable()
export class JanusService {
  async forwardJanusRequest(payload: Record<string, unknown>): Promise<JanusEvent> {
    try {
      const response = await axios.post<JanusEvent>(CALL_CONSTANTS.janusHttpUrl, payload, {
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(`Janus request failed: ${(error as Error).message}`);
    }
  }
}
