import dotenv from 'dotenv'; // Load environment variables from .env file
import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { MatchingEngine } from './core/matching-engine.js';
import { WebSocketService } from './services/websocket-service.js';
import { registerRoutes } from './api/routes.js';
import { SimulationClient } from './services/simulation-client.js';

dotenv.config();

const server = fastify({
  logger: {
    level: (process.env['HIDE_LOGS'] || process.env['NODE_ENV'] === 'production') ? 'warn' : 'debug',
    transport: (process.env['NODE_ENV'] === 'development' && !process.env['HIDE_LOGS']) ? {
      target: 'pino-pretty'
    } : undefined
  } as any
});

console.log('process.env[\'HIDE_LOGS\']', process.env['HIDE_LOGS'])
console.log('server.log.level', server.log.level)
const matchingEngine = new MatchingEngine(server.log);
const wsService = new WebSocketService(matchingEngine, server.log);
const simulationClient = new SimulationClient(server.log);

async function start() {
  try {
    server.log.info(`Starting CryptoTrade backend...`);
    server.log.info(`SIMULATION_API_KEY: ${process.env['SIMULATION_API_KEY']}`);

    await server.register(cors, {
      origin: process.env['NODE_ENV'] === 'production' ? [
        'https://cryptotrade-frontend-production.up.railway.app', // Production frontend
        /^https:\/\/cryptotrade-frontend-.*\.up\.railway\.app$/ // Railway preview deployments
      ] : [
        'http://localhost:5173', // Local development
      ],
      credentials: true
    });
    server.log.info('CORS registered');

    // Global rate limiting for public endpoints
    await server.register(rateLimit, {
      global: false, // Don't apply globally, we'll apply per route
      max: 100, // Conservative limit for public endpoints
      timeWindow: '1 minute'
    });
    server.log.info('Rate limiting registered');

    await server.register(swagger, {
      openapi: {
        openapi: '3.0.0',
        info: {
          title: 'CryptoTrade API',
          description: 'High-performance cryptocurrency trading system API with ultra-high volume order processing and sub-millisecond latency',
          version: '1.0.0',
          contact: {
            name: 'CryptoTrade Support',
            email: 'support@cryptotrade.com'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: 'http://localhost:3001',
            description: 'Development server'
          }
        ],
        tags: [
          { name: 'Orders', description: 'Order management endpoints' },
          { name: 'Market Data', description: 'Market data and order book endpoints' },
          { name: 'Portfolio', description: 'User portfolio management' },
          { name: 'System', description: 'System health and metrics' },
          { name: 'Simulation', description: 'Trading simulation endpoints' },
          { name: 'WebSocket', description: 'Real-time WebSocket connections' }
        ],
        components: {
          securitySchemes: {
            apiKey: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key'
            }
          },
          schemas: {
            Error: {
              type: 'object',
              properties: {
                error: { type: 'string', description: 'Error message' }
              }
            },
            MarketDataMessage: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['trade', 'orderbook_update', 'ticker'] },
                pair: { type: 'string', description: 'Trading pair' },
                data: { type: 'object', description: 'Message payload' },
                timestamp: { type: 'number', description: 'Message timestamp' }
              }
            },
            OrderUpdateMessage: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['order_placed', 'order_filled', 'order_cancelled'] },
                orderId: { type: 'string', description: 'Order identifier' },
                userId: { type: 'string', description: 'User identifier' },
                data: { type: 'object', description: 'Order data' },
                timestamp: { type: 'number', description: 'Message timestamp' }
              }
            }
          }
        },
        paths: {
          '/ws/market': {
            get: {
              tags: ['WebSocket'],
              summary: 'WebSocket Market Data',
              description: 'Real-time market data WebSocket connection. Upgrade to WebSocket protocol to receive live market updates.',
              parameters: [
                {
                  name: 'Connection',
                  in: 'header',
                  required: true,
                  schema: { type: 'string', enum: ['Upgrade'] }
                },
                {
                  name: 'Upgrade',
                  in: 'header',
                  required: true,
                  schema: { type: 'string', enum: ['websocket'] }
                }
              ],
              responses: {
                101: {
                  description: 'Switching Protocols - WebSocket connection established',
                  content: {
                    'application/json': {
                      schema: {
                        oneOf: [
                          { $ref: '#/components/schemas/MarketDataMessage' }
                        ]
                      }
                    }
                  }
                },
                400: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '/ws/orders': {
            get: {
              tags: ['WebSocket'],
              summary: 'WebSocket Order Updates',
              description: 'Real-time order updates WebSocket connection. Upgrade to WebSocket protocol to receive user-specific order updates.',
              parameters: [
                {
                  name: 'Connection',
                  in: 'header',
                  required: true,
                  schema: { type: 'string', enum: ['Upgrade'] }
                },
                {
                  name: 'Upgrade',
                  in: 'header',
                  required: true,
                  schema: { type: 'string', enum: ['websocket'] }
                }
              ],
              responses: {
                101: {
                  description: 'Switching Protocols - WebSocket connection established',
                  content: {
                    'application/json': {
                      schema: {
                        oneOf: [
                          { $ref: '#/components/schemas/OrderUpdateMessage' }
                        ]
                      }
                    }
                  }
                },
                400: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    });
    server.log.info('Swagger registered');

    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      },
      uiHooks: {
        onRequest: function (_request, _reply, next) { next() },
        preHandler: function (_request, _reply, next) { next() }
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
      transformSpecification: (swaggerObject, _request, _reply) => { return swaggerObject },
      transformSpecificationClone: true
    });
    server.log.info('Swagger UI registered');

    await wsService.register(server);
    server.log.info('WebSocket service registered');

    registerRoutes(server, matchingEngine, simulationClient);
    server.log.info('Routes registered');

    const port = parseInt(process.env['PORT'] || '3001');
    const host = process.env['HOST'] || '0.0.0.0';

    server.log.info(`Attempting to listen on ${host}:${port}...`);
    await server.listen({ port, host });

    server.log.info(`✅ CryptoTrade backend running on ${host}:${port}`);
    server.log.info(`WebSocket endpoint: ws://${host}:${port}/ws/market`);
    server.log.info(`REST API: http://${host}:${port}/api`);
    server.log.info(`Health check: http://${host}:${port}/api/health`);
    server.log.info(`📚 API Documentation: http://${host}:${port}/docs`);
  } catch (err) {
    server.log.error('❌ Failed to start server:', err);
    server.log.error(err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  server.log.info('\nShutting down gracefully...');
  wsService.shutdown();
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('\nShutting down gracefully...');

  wsService.shutdown();
  await server.close();
  process.exit(0);
});

start();