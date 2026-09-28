import { Injectable } from '@nestjs/common';

interface ChatAuthContext {
  uid?: string;
  name?: string;
  role?: string;
  email?: string;
}

interface ChatResponse {
  success: true;
  reply: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class ChatService {
  /**
   * Personalized chat reply.
   * Real AI/agent logic in legacy single-file backend; this stub returns
   * a context-aware fallback until full chat agent migration completes.
   */
  async process(message: string, role?: string, auth?: ChatAuthContext): Promise<ChatResponse> {
    const name = auth?.name || 'there';
    const lower = message.toLowerCase();

    // Simple intent routing — same patterns as legacy chatbot
    if (/^(hi|hello|salam|assalam|hey)/i.test(lower)) {
      return { success: true, reply: `Assalamu Alaikum ${name}! How can I help you today?` };
    }
    if (lower.includes('class') || lower.includes('schedule')) {
      return { success: true, reply: 'You can check your scheduled classes in the Classes tab.' };
    }
    if (lower.includes('invoice') || lower.includes('payment') || lower.includes('bill')) {
      return { success: true, reply: 'Invoices are available in your dashboard under Invoices.' };
    }
    if (lower.includes('teacher')) {
      return { success: true, reply: 'For teacher-related queries, please contact support.' };
    }
    if (lower.includes('support') || lower.includes('help')) {
      return { success: true, reply: 'Visit the Support tab to raise a ticket. Our team responds within 24h.' };
    }

    return {
      success: true,
      reply: `I noted your message: "${message}". A team member will follow up if needed.`,
      context: { role, userId: auth?.uid },
    };
  }
}
