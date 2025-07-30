import fastify from 'fastify';
import cors from '@fastify/cors';
import { MatchingEngine } from './core/matching-engine.js';
import { WebSocketService } from './services/websocket-service.js';
import { registerRoutes } from './api/routes.js';

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
    console.log('Starting CryptoTrade backend...');
    
    await server.register(cors, {
      origin: true,
      credentials: true
    });
    console.log('CORS registered');

    await wsService.register(server);
    console.log('WebSocket service registered');
    
    registerRoutes(server, matchingEngine);
    console.log('Routes registered');

    const port = parseInt(process.env['PORT'] || '3001');
    const host = process.env['HOST'] || '0.0.0.0';
    
    console.log(`Attempting to listen on ${host}:${port}...`);
    await server.listen({ port, host });
    
    console.log(`✅ CryptoTrade backend running on ${host}:${port}`);
    console.log(`WebSocket endpoint: ws://${host}:${port}/ws/market`);
    console.log(`REST API: http://${host}:${port}/api`);
    console.log(`Health check: http://${host}:${port}/api/health`);
  } catch (err) {
    console.error('❌ Failed to start server:', err);
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