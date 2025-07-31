/**
 * Main entry point for the CryptoTrade Simulation Server
 * 
 * This server provides high-performance cryptocurrency trading simulation capabilities,
 * generating realistic market data and trading loads for testing and benchmarking.
 * It can simulate up to 200,000 orders per second with minimal resource usage.
 */

import Fastify from 'fastify';
import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { simulationService } from './simulation-service.js';
import { SimulationRequest } from './types.js';

// Server configuration from environment variables with defaults
const PORT = parseInt(process.env.PORT || '3002');
const HOST = process.env.HOST || '0.0.0.0';

// Initialize Fastify instance with logging configuration
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

// Register CORS middleware to allow cross-origin requests
// This enables the frontend to communicate with the simulation server
await fastify.register(cors, {
  origin: true,
  credentials: true
});

// Register Swagger for API documentation generation
await fastify.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'CryptoTrade Simulation Server API',
      description: 'High-performance cryptocurrency trading simulation server API for generating realistic trading load with up to 200K orders per second',
      version: '1.0.0',
      contact: {
        name: 'CryptoTrade Simulation Support',
        email: 'simulation@cryptotrade.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development simulation server'
      }
    ],
    tags: [
      { name: 'Simulation', description: 'Trading simulation management endpoints' },
      { name: 'System', description: 'System health and monitoring endpoints' }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' }
          },
          required: ['error']
        },
        SimulationRequest: {
          type: 'object',
          properties: {
            ordersPerSecond: {
              type: 'integer',
              minimum: 1,
              maximum: 200000,
              description: 'Number of orders to generate per second'
            },
            durationSeconds: {
              type: 'integer',
              minimum: 1,
              maximum: 300,
              description: 'Duration of simulation in seconds (max 5 minutes)'
            },
            pair: {
              type: 'string',
              description: 'Trading pair to simulate'
            },
            targetEndpoint: {
              type: 'string',
              format: 'uri',
              description: 'Target trading server endpoint URL'
            }
          },
          required: ['ordersPerSecond', 'durationSeconds', 'pair', 'targetEndpoint']
        },
        SimulationStatus: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Simulation identifier' },
            status: {
              type: 'string',
              enum: ['running', 'completed', 'failed'],
              description: 'Current simulation status'
            },
            ordersProcessed: { type: 'integer', description: 'Number of orders processed' },
            ordersSent: { type: 'integer', description: 'Number of orders sent to target server' },
            startTime: { type: 'integer', description: 'Simulation start timestamp' },
            endTime: { type: 'integer', description: 'Simulation end timestamp (if completed)' },
            memoryUsage: { type: 'number', description: 'Memory usage in MB' },
            error: { type: 'string', description: 'Error message (if failed)' },
            parameters: { $ref: '#/components/schemas/SimulationRequest' }
          },
          required: ['id', 'status', 'ordersProcessed', 'ordersSent', 'startTime', 'memoryUsage', 'parameters']
        },
        SystemStats: {
          type: 'object',
          properties: {
            timestamp: { type: 'integer', description: 'Stats timestamp' },
            service: { type: 'string', description: 'Service name' },
            memoryUsage: { type: 'number', description: 'Current memory usage in MB' },
            activeSimulations: { type: 'integer', description: 'Number of active simulations' },
            totalSimulations: { type: 'integer', description: 'Total simulations run' },
            uptime: { type: 'number', description: 'Server uptime in seconds' }
          }
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'], description: 'Health status' },
            service: { type: 'string', description: 'Service name' },
            timestamp: { type: 'integer', description: 'Health check timestamp' },
            memoryUsage: { type: 'number', description: 'Current memory usage in MB' },
            activeSimulations: { type: 'integer', description: 'Number of active simulations' },
            totalSimulations: { type: 'integer', description: 'Total simulations run' }
          },
          required: ['status', 'service', 'timestamp']
        }
      }
    }
  }
});

// Register Swagger UI for interactive API documentation
// Available at http://localhost:PORT/docs
await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  },
  staticCSP: true,
  transformStaticCSP: (header) => header
});

/**
 * Health check endpoint
 * 
 * Returns the current health status of the simulation server including:
 * - Service status
 * - Memory usage
 * - Active simulation count
 * - Total simulations processed
 * - Server uptime
 */
fastify.get('/health', {
  schema: {
    tags: ['System'],
    summary: 'Health check',
    description: 'Check simulation server health and system status',
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok'], description: 'Health status' },
          service: { type: 'string', description: 'Service name' },
          timestamp: { type: 'integer', description: 'Health check timestamp' },
          memoryUsage: { type: 'number', description: 'Current memory usage in MB' },
          activeSimulations: { type: 'integer', description: 'Number of active simulations' },
          totalSimulations: { type: 'integer', description: 'Total simulations run' }
        },
        required: ['status', 'service', 'timestamp']
      }
    }
  }
}, async () => {
  // Retrieve current system statistics from the simulation service
  const systemStats = simulationService.getSystemStats();
  return {
    status: 'ok',
    service: 'cryptotrade-simulation-server',
    timestamp: Date.now(),
    memoryUsage: systemStats.memoryUsage.heapUsed,
    activeSimulations: systemStats.activeSimulations,
    totalSimulations: systemStats.totalSimulations,
    uptime: systemStats.uptime
  };
});

/**
 * Start a new trading simulation
 * 
 * This endpoint initiates a new high-volume trading simulation with customizable parameters.
 * The simulation will generate orders at the specified rate and send them to the target endpoint.
 * 
 * Key features:
 * - Supports up to 200,000 orders per second
 * - Maximum duration of 5 minutes per simulation
 * - Real-time progress tracking via status endpoint
 * - Memory-efficient object pooling for order generation
 */
fastify.post<{ Body: SimulationRequest }>('/api/simulate', {
  schema: {
    tags: ['Simulation'],
    summary: 'Start new simulation',
    description: 'Start a new high-volume trading simulation with specified parameters',
    body: {
      type: 'object',
      properties: {
        ordersPerSecond: {
          type: 'integer',
          minimum: 1,
          maximum: 200000,
          description: 'Number of orders to generate per second'
        },
        durationSeconds: {
          type: 'integer',
          minimum: 1,
          maximum: 300,
          description: 'Duration of simulation in seconds (max 5 minutes)'
        },
        pair: {
          type: 'string',
          description: 'Trading pair to simulate'
        },
        targetEndpoint: {
          type: 'string',
          format: 'uri',
          description: 'Target trading server endpoint URL'
        }
      },
      required: ['ordersPerSecond', 'durationSeconds', 'pair', 'targetEndpoint']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Simulation ID' },
          message: { type: 'string', description: 'Status message' },
          timestamp: { type: 'integer', description: 'Start timestamp' },
          serverInfo: {
            type: 'object',
            properties: {
              service: { type: 'string', description: 'Service name' },
              maxCapacity: { type: 'string', description: 'Maximum capacity' },
              memoryUsage: { type: 'number', description: 'Memory usage in MB' },
              activeSimulations: { type: 'integer', description: 'Active simulations count' }
            }
          }
        }
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' }
        },
        required: ['error']
      },
      500: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' }
        },
        required: ['error']
      }
    }
  }
}, async (request, reply) => {
  try {
    const { ordersPerSecond, durationSeconds, pair, targetEndpoint } = request.body;

    // Validate all required fields are present
    if (!ordersPerSecond || !durationSeconds || !pair || !targetEndpoint) {
      return reply.code(400).send({
        error: 'Missing required fields: ordersPerSecond, durationSeconds, pair, targetEndpoint'
      });
    }

    // Enforce maximum orders per second limit to prevent server overload
    if (ordersPerSecond > 200000) {
      return reply.code(400).send({
        error: 'Maximum 200,000 orders per second supported on simulation server'
      });
    }

    // Enforce maximum duration to prevent long-running simulations
    if (durationSeconds > 300) {
      return reply.code(400).send({
        error: 'Maximum 5 minutes duration supported'
      });
    }

    // Start the simulation through the simulation service
    const result = await simulationService.startSimulation({
      ordersPerSecond,
      durationSeconds,
      pair,
      targetEndpoint
    });

    // Include server statistics in the response for monitoring
    const systemStats = simulationService.getSystemStats();
    return reply.send({
      id: result.simulationId,
      message: result.message,
      timestamp: Date.now(),
      serverInfo: {
        service: 'cryptotrade-simulation-server',
        maxCapacity: '200K orders/sec',
        memoryUsage: systemStats.memoryUsage.heapUsed,
        activeSimulations: systemStats.activeSimulations
      }
    });

  } catch (error) {
    console.error('Simulation start failed:', error);
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get simulation status
 * 
 * Retrieves the current status and progress of a running or completed simulation.
 * Use this endpoint to monitor simulation progress and check completion status.
 */
fastify.get<{ Params: { id: string } }>('/api/simulate/:id/status', {
  schema: {
    tags: ['Simulation'],
    summary: 'Get simulation status',
    description: 'Retrieve the current status and progress of a simulation',
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Simulation ID' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Simulation identifier' },
          status: {
            type: 'string',
            enum: ['running', 'completed', 'failed'],
            description: 'Current simulation status'
          },
          ordersProcessed: { type: 'integer', description: 'Number of orders processed' },
          ordersSent: { type: 'integer', description: 'Number of orders sent to target server' },
          startTime: { type: 'integer', description: 'Simulation start timestamp' },
          endTime: { type: 'integer', description: 'Simulation end timestamp (if completed)' },
          memoryUsage: { type: 'number', description: 'Memory usage in MB' },
          error: { type: 'string', description: 'Error message (if failed)' }
        },
        required: ['id', 'status', 'ordersProcessed', 'ordersSent', 'startTime', 'memoryUsage']
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' }
        },
        required: ['error']
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params;
  // Query simulation service for status
  const status = simulationService.getSimulationStatus(id);

  if (!status) {
    return reply.code(404).send({ error: 'Simulation not found' });
  }

  return reply.send(status);
});

/**
 * Stop a running simulation
 * 
 * Gracefully stops a running simulation before its scheduled completion.
 * This is useful for stopping long-running simulations or when errors are detected.
 */
fastify.post<{ Params: { id: string } }>('/api/simulate/:id/stop', {
  schema: {
    tags: ['Simulation'],
    summary: 'Stop simulation',
    description: 'Stop a running simulation by ID',
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Simulation ID to stop' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Success message' }
        }
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' }
        },
        required: ['error']
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params;
  // Attempt to stop the simulation
  const stopped = simulationService.stopSimulation(id);

  if (!stopped) {
    return reply.code(404).send({ error: 'Simulation not found or already stopped' });
  }

  return reply.send({ message: 'Simulation stopped successfully' });
});

/**
 * Get simulation logs
 * 
 * Retrieves detailed performance logs for a completed simulation in CSV format.
 * The logs include timing information, order counts, and performance metrics
 * collected during the simulation run.
 */
fastify.get<{ Params: { id: string } }>('/api/simulate/:id/logs', {
  schema: {
    tags: ['Simulation'],
    summary: 'Get simulation logs',
    description: 'Retrieve the logs of a simulation in CSV format',
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Simulation ID' }
      }
    },
    response: {
      200: {
        type: 'string',
        description: 'Simulation logs in CSV format'
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' }
        },
        required: ['error']
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params;
  // Retrieve logs from the simulation service
  const logs = simulationService.getSimulationLogsCSV(id);

  if (!logs) {
    return reply.code(404).send({ error: 'Logs not found for this simulation' });
  }

  // Set appropriate headers for CSV download
  reply.header('Content-Type', 'text/csv');
  reply.header('Content-Disposition', `attachment; filename=simulation-${id}-logs.csv`);
  return reply.send(logs);
});

/**
 * List active simulations
 * 
 * Returns a list of all currently running simulations with their current status.
 * Useful for monitoring server load and managing multiple concurrent simulations.
 */
fastify.get('/api/simulate/active', {
  schema: {
    tags: ['Simulation'],
    summary: 'List active simulations',
    description: 'Get list of all currently running simulations',
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Simulation identifier' },
            status: {
              type: 'string',
              enum: ['running', 'completed', 'failed'],
              description: 'Current simulation status'
            },
            ordersProcessed: { type: 'integer', description: 'Number of orders processed' },
            ordersSent: { type: 'integer', description: 'Number of orders sent to target server' },
            startTime: { type: 'integer', description: 'Simulation start timestamp' }
          }
        }
      }
    }
  }
}, async () => {
  // Return list of active simulations from the service
  return simulationService.listActiveSimulations();
});

/**
 * List all simulations
 * 
 * Returns a comprehensive list of all simulations including active, completed, and failed.
 * Provides a complete history of simulation runs for analysis and debugging.
 */
fastify.get('/api/simulate/all', {
  schema: {
    tags: ['Simulation'],
    summary: 'List all simulations',
    description: 'Get list of all simulations (active, completed, and failed)',
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Simulation identifier' },
            status: {
              type: 'string',
              enum: ['running', 'completed', 'failed'],
              description: 'Current simulation status'
            },
            ordersProcessed: { type: 'integer', description: 'Number of orders processed' },
            ordersSent: { type: 'integer', description: 'Number of orders sent to target server' },
            startTime: { type: 'integer', description: 'Simulation start timestamp' }
          }
        }
      }
    }
  }
}, async () => {
  // Return complete simulation history from the service
  return simulationService.getAllSimulations();
});

/**
 * System statistics endpoint
 * 
 * Provides detailed system performance metrics and resource usage information.
 * Use this to monitor server health and capacity for running simulations.
 */
fastify.get('/api/stats', {
  schema: {
    tags: ['System'],
    summary: 'Get system statistics',
    description: 'Retrieve detailed system performance and simulation statistics',
    response: {
      200: {
        type: 'object',
        properties: {
          timestamp: { type: 'integer', description: 'Stats timestamp' },
          service: { type: 'string', description: 'Service name' },
          memoryUsage: { type: 'number', description: 'Current memory usage in MB' },
          activeSimulations: { type: 'integer', description: 'Number of active simulations' },
          totalSimulations: { type: 'integer', description: 'Total simulations run' },
          uptime: { type: 'number', description: 'Server uptime in seconds' }
        }
      }
    }
  }
}, async () => {
  // Collect current system statistics
  const systemStats = simulationService.getSystemStats();
  return {
    timestamp: Date.now(),
    service: 'cryptotrade-simulation-server',
    memoryUsage: systemStats.memoryUsage.heapUsed,
    activeSimulations: systemStats.activeSimulations,
    totalSimulations: systemStats.totalSimulations,
    uptime: systemStats.uptime
  };
});

/**
 * Graceful shutdown handler
 * 
 * Ensures all active simulations are properly stopped before server shutdown.
 * This prevents data loss and ensures clean termination of all processes.
 */
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop all active simulations before shutdown
  const activeSimulations = simulationService.listActiveSimulations();
  console.log(`Stopping ${activeSimulations.length} active simulations...`);

  for (const simulation of activeSimulations) {
    simulationService.stopSimulation(simulation.id);
  }

  try {
    // Close the Fastify server
    await fastify.close();
    console.log('Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Global error handlers to prevent unexpected crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Server startup function
 * 
 * Initializes the Fastify server and displays startup information including
 * memory usage, object pool status, and available endpoints.
 */
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 CryptoTrade Simulation Server listening on ${HOST}:${PORT}`);
    console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`📊 Object pool pre-warmed with 5000 orders`);
    console.log(`📚 API Documentation: http://${HOST}:${PORT}/docs`);
    console.log(`🔍 Health Check: http://${HOST}:${PORT}/health`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Initialize and start the server
start();