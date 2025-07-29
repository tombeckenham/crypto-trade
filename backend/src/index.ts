import fastify from 'fastify';
import cors from '@fastify/cors';
import { MatchingEngine } from './core/matching-engine';
import { WebSocketService } from './services/websocket-service';
import { registerRoutes } from './api/routes';

const server = fastify({
  logger: {
    level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
    transport: process.env['NODE_ENV'] === 'development' ? {
      target: 'pino-pretty'
    } : undefined
  } as any
});

const matchingEngine = new MatchingEngine();
const wsService = new WebSocketService(matchingEngine);

async function start() {
  try {
    await server.register(cors, {
      origin: true,
      credentials: true
    });

    await wsService.register(server);
    
    registerRoutes(server, matchingEngine);

    const port = parseInt(process.env['PORT'] || '3001');
    const host = process.env['HOST'] || '0.0.0.0';
    
    await server.listen({ port, host });
    
    console.log(`FluxTrade backend running on ${host}:${port}`);
    console.log('WebSocket endpoint: ws://localhost:3001/ws/market');
    console.log('REST API: http://localhost:3001/api');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  wsService.shutdown();
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  wsService.shutdown();
  await server.close();
  process.exit(0);
});

start();