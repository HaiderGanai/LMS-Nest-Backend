import type { Request, Response } from 'express';
import httpProxy from 'http-proxy';
import type { ServerResponse } from 'http';

const JANUS_TARGET = process.env.JANUS_HTTP_URL || 'http://127.0.0.1:8088';
const janusProxy = httpProxy.createProxyServer({
  target: JANUS_TARGET,
  changeOrigin: true,
});

janusProxy.on('error', (...args: unknown[]) => {
  const response = args[2] as ServerResponse | undefined;
  if (!response || typeof response.writeHead !== 'function') {
    return;
  }
  response.writeHead(502, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Janus upstream is unavailable' }));
});

export const janusProxyMiddleware = (request: Request, response: Response): void => {
  janusProxy.web(request, response);
};
