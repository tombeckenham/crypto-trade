import Fastify from 'fastify';
import cors from '@fastify/cors';
import { simulationService } from './simulation-service.js';
import { SimulationRequest } from './types.js';

const PORT = parseInt(process.env.PORT || '3002');
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({  
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

// Register CORS
await fastify.register(cors, {
  origin: true,
  credentials: true
});

// Health check
fastify.get('/health', async () => {
  const systemStats = simulationService.getSystemStats();
  return {
    status: 'ok',
    service: 'fluxtrade-simulation-server',
    timestamp: Date.now(),
    ...systemStats
  };
});

// Start simulation
fastify.post<{ Body: SimulationRequest }>('/api/simulate', async (request, reply) => {
  try {
    const { ordersPerSecond, durationSeconds, pair, targetEndpoint } = request.body;
    
    // Validation
    if (!ordersPerSecond || !durationSeconds || !pair || !targetEndpoint) {
      return reply.code(400).send({ 
        error: 'Missing required fields: ordersPerSecond, durationSeconds, pair, targetEndpoint' 
      });
    }
    
    if (ordersPerSecond > 200000) {
      return reply.code(400).send({ 
        error: 'Maximum 200,000 orders per second supported on simulation server' 
      });
    }
    
    if (durationSeconds > 300) {
      return reply.code(400).send({ 
        error: 'Maximum 5 minutes duration supported' 
      });
    }

    const result = await simulationService.startSimulation({
      ordersPerSecond,
      durationSeconds, 
      pair,
      targetEndpoint
    });

    return reply.send({
      ...result,
      timestamp: Date.now(),
      serverInfo: {
        service: 'fluxtrade-simulation-server',
        maxCapacity: '200K orders/sec',
        ...simulationService.getSystemStats()
      }
    });
    
  } catch (error) {
    console.error('Simulation start failed:', error);
    return reply.code(500).send({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get simulation status
fastify.get<{ Params: { id: string } }>('/api/simulate/:id/status', async (request, reply) => {
  const { id } = request.params;
  const status = simulationService.getSimulationStatus(id);
  
  if (!status) {
    return reply.code(404).send({ error: 'Simulation not found' });
  }
  
  return reply.send(status);
});

// Stop simulation
fastify.post<{ Params: { id: string } }>('/api/simulate/:id/stop', async (request, reply) => {
  const { id } = request.params;
  const stopped = simulationService.stopSimulation(id);
  
  if (!stopped) {
    return reply.code(404).send({ error: 'Simulation not found or already stopped' });
  }
  
  return reply.send({ message: 'Simulation stopped successfully' });
});

// List active simulations
fastify.get('/api/simulate/active', async () => {
  return simulationService.listActiveSimulations();
});

// List all simulations
fastify.get('/api/simulate/all', async () => {
  return simulationService.getAllSimulations();
});

// System statistics
fastify.get('/api/stats', async () => {
  return {
    timestamp: Date.now(),
    service: 'fluxtrade-simulation-server',
    ...simulationService.getSystemStats()
  };
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Stop all active simulations
  const activeSimulations = simulationService.listActiveSimulations();
  console.log(`Stopping ${activeSimulations.length} active simulations...`);
  
  for (const simulation of activeSimulations) {
    simulationService.stopSimulation(simulation.id);
  }
  
  try {
    await fastify.close();
    console.log('Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 FluxTrade Simulation Server listening on ${HOST}:${PORT}`);
    console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`📊 Object pool pre-warmed with 5000 orders`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();