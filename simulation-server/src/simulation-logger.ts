export interface SimulationLogEntry {
  timestamp: number;
  simulationId: string;
  event: string;
  details: Record<string, any>;
}

export class SimulationLogger {
  private logs: SimulationLogEntry[] = [];

  log(simulationId: string, event: string, details: Record<string, any>): void {
    this.logs.push({
      timestamp: Date.now(),
      simulationId,
      event,
      details
    });
  }

  getLogs(): SimulationLogEntry[] {
    return this.logs;
  }

  getLogsForSimulationAsCSV(simulationId: string): string | null {
    const simLogs = this.logs.filter(log => log.simulationId === simulationId);

    if (simLogs.length === 0) {
      return null;
    }

    // Dynamically create headers from all possible detail keys in the simulation's logs
    const allKeys = new Set<string>();
    simLogs.forEach(log => {
      Object.keys(log.details).forEach(key => allKeys.add(key));
    });
    const detailHeaders = Array.from(allKeys);
    const headers = ['timestamp', 'simulationId', 'event', ...detailHeaders];

    const csvRows = [headers.join(',')];

    for (const log of simLogs) {
      const values = [
        log.timestamp,
        log.simulationId,
        log.event,
        ...detailHeaders.map(header => {
          const value = log.details[header];
          if (value === undefined || value === null) return '';
          if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          return value;
        })
      ];
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }


  clear(): void {
    this.logs = [];
  }

  // Cleanup old logs for a specific simulation
  cleanup(simulationId: string): void {
    this.logs = this.logs.filter(log => log.simulationId !== simulationId);
  }
}