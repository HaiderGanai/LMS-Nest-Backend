import { Controller, Get, Req } from '@nestjs/common';

@Controller('/api/config')
export class AppConfigController {
  @Get('/')
  async getConfig(@Req() req: any) {
    const configVersion = process.env.CONFIG_VERSION || process.env.CONFIG_UPDATED_AT || '1.0.0';

    const envTurnUrls = process.env.TURN_URLS
      ? process.env.TURN_URLS.split(',').map((url) => url.trim()).filter(Boolean)
      : [];

    const envSocketUrl = process.env.SOCKET_URL || null;
    const inferredSocketUrl = `${req.protocol}://${req.get('host')}`;
    const envJanusUrl = process.env.JANUS_PUBLIC_URL || null;
    const sttEnabled = String(process.env.STT_ENABLED || '').toLowerCase() === 'true';

    // Build ICE servers
    let iceServers: any[] = [];
    if (process.env.ICE_SERVERS_JSON) {
      try { iceServers = JSON.parse(process.env.ICE_SERVERS_JSON); } catch (e) { /* ignore */ }
    }
    if (iceServers.length === 0 && envTurnUrls.length > 0) {
      iceServers = envTurnUrls.map(url => ({
        urls: url,
        username: process.env.TURN_USERNAME || undefined,
        credential: process.env.TURN_CREDENTIAL || undefined,
      }));
    }

    return {
      version: configVersion,
      apiBaseUrl: envSocketUrl || inferredSocketUrl,
      socketUrl: envSocketUrl || inferredSocketUrl,
      janusUrl: envJanusUrl,
      iceServers,
      turn: {
        urls: envTurnUrls,
        username: process.env.TURN_USERNAME || null,
        credential: process.env.TURN_CREDENTIAL || null,
      },
      stt: { enabled: sttEnabled },
      stripe: {
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      },
    };
  }

  @Get('/status')
  async status() {
    return {
      status: 'ok',
      configVersion: process.env.CONFIG_VERSION || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
