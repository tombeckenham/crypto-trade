/**
 * Client service for external simulation server
 * Allows running high-volume simulations without affecting main trading server
 */

import 'dotenv/config';

interface SimulationRequest {
  ordersPerSecond: number;
  durationSeconds: number;
  pair: string;
  targetEndpoint?: string; // Main server endpoint to send orders to
}

interface SimulationResponse {
  message: string;
  simulationId: string;
  parameters: SimulationRequest;
  startTime: number;
  marketData?: any;
}

interface SimulationStatus {
  id: string;
  status: 'running' | 'completed' | 'failed';
  ordersProcessed: number;
  startTime: number;
  endTime?: number;
  memoryUsage?: number;
  error?: string;
}

console.log('SIMULATION_SERVER_URL', process.env['SIMULATION_SERVER_URL'])
console.log('PUBLIC_URL', process.env['PUBLIC_URL'])

export class SimulationClient {
  private simulationServerUrl: string = process.env['SIMULATION_SERVER_URL'] || 'http://localhost:3002';
  private mainServerUrl: string = process.env['PUBLIC_URL'] || 'http://localhost:3001';

  async startExternalSimulation(params: SimulationRequest): Promise<SimulationResponse> {
    try {
      const response = await fetch(`${this.simulationServerUrl}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          targetEndpoint: `${this.mainServerUrl}/api/orders`
        })
      });

      if (!response.ok) {
        throw new Error(`Simulation server error: ${response.status}`);
      }

      return await response.json() as SimulationResponse;
    } catch (error) {
      // Fallback to local simulation if external server unavailable
      console.warn('External simulation server unavailable, falling back to local simulation');
      throw error;
    }
  }

  async getSimulationStatus(simulationId: string): Promise<SimulationStatus> {
    const response = await fetch(`${this.simulationServerUrl}/api/simulate/${simulationId}/status`);

    if (!response.ok) {
      throw new Error(`Failed to get simulation status: ${response.status}`);
    }

    return await response.json() as SimulationStatus;
  }

  async stopSimulation(simulationId: string): Promise<void> {
    const response = await fetch(`${this.simulationServerUrl}/api/simulate/${simulationId}/stop`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Failed to stop simulation: ${response.status}`);
    }
  }

  async listActiveSimulations(): Promise<SimulationStatus[]> {
    const response = await fetch(`${this.simulationServerUrl}/api/simulate/active`);

    if (!response.ok) {
      throw new Error(`Failed to list simulations: ${response.status}`);
    }

    return await response.json() as SimulationStatus[];
  }

  async isExternalSimulationAvailable(): Promise<boolean> {
    if (!process.env['SIMULATION_SERVER_URL']) {
      return false;
    }

    try {
      const response = await fetch(`${this.simulationServerUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      return response.ok;
    } catch (error) {
      console.warn('Simulation server health check failed:', error);
      return false;
    }
  }
}

export const simulationClient = new SimulationClient();