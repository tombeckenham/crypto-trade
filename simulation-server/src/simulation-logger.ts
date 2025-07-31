/**
 * SimulationLogger - High-performance logging system for trading simulations
 * 
 * This module provides structured logging capabilities for tracking simulation
 * events and performance metrics. Features include:
 * 
 * - In-memory log storage for fast access
 * - CSV export functionality for analysis
 * - Automatic cleanup to prevent memory leaks
 * - Dynamic column generation based on logged data
 */

/**
 * Structure for individual log entries
 */
export interface SimulationLogEntry {
  // Unix timestamp when the event occurred
  timestamp: number;
  // Unique identifier of the simulation
  simulationId: string;
  // Event type (e.g., "OrderCreated", "MarketCorrection")
  event: string;
  // Flexible key-value pairs for event-specific data
  details: Record<string, any>;
}

/**
 * Logger class for capturing and managing simulation events
 */
export class SimulationLogger {
  // In-memory storage for all log entries
  private logs: SimulationLogEntry[] = [];

  /**
   * Records a new log entry for a simulation event
   * 
   * @param simulationId - ID of the simulation generating the event
   * @param event - Type of event being logged
   * @param details - Event-specific data to record
   * 
   * Common events include:
   * - SimulationStart: Initial simulation parameters
   * - OrderCreated: Individual order details
   * - MarketCorrection: Market imbalance adjustments
   * - SimulationEnd: Final statistics
   */
  log(simulationId: string, event: string, details: Record<string, any>): void {
    this.logs.push({
      timestamp: Date.now(),
      simulationId,
      event,
      details
    });
  }

  /**
   * Retrieves all log entries
   * 
   * @returns Array of all logged events
   * 
   * Note: Returns reference to internal array for performance.
   * Modifications will affect the logger state.
   */
  getLogs(): SimulationLogEntry[] {
    return this.logs;
  }

  /**
   * Exports logs for a specific simulation as CSV format
   * 
   * @param simulationId - ID of the simulation to export
   * @returns CSV string with all log data, or null if no logs found
   * 
   * The CSV format dynamically adapts to include all unique fields
   * found in the simulation's log entries. This allows for flexible
   * analysis of different event types without predefined schemas.
   */
  getLogsForSimulationAsCSV(simulationId: string): string | null {
    // Filter logs for the requested simulation
    const simLogs = this.logs.filter(log => log.simulationId === simulationId);

    if (simLogs.length === 0) {
      return null;
    }

    // Dynamically collect all unique detail keys across all log entries
    // This ensures the CSV includes columns for all logged fields
    const allKeys = new Set<string>();
    simLogs.forEach(log => {
      Object.keys(log.details).forEach(key => allKeys.add(key));
    });
    const detailHeaders = Array.from(allKeys);
    // Construct CSV headers with fixed columns plus dynamic detail columns
    const headers = ['timestamp', 'simulationId', 'event', ...detailHeaders];

    // Build CSV content starting with headers
    const csvRows = [headers.join(',')];

    // Convert each log entry to a CSV row
    for (const log of simLogs) {
      const values = [
        log.timestamp,
        log.simulationId,
        log.event,
        // Map detail values, handling missing fields and complex objects
        ...detailHeaders.map(header => {
          const value = log.details[header];
          // Empty string for missing values
          if (value === undefined || value === null) return '';
          // JSON stringify objects and escape quotes for CSV compatibility
          if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          return value;
        })
      ];
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }


  /**
   * Clears all log entries
   * 
   * Use with caution - this removes all simulation history
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Removes all logs for a specific simulation
   * 
   * @param simulationId - ID of the simulation to clean up
   * 
   * This method is called when simulations complete to prevent
   * unbounded memory growth. Logs are kept temporarily for export
   * but cleaned up after a reasonable retention period.
   */
  cleanup(simulationId: string): void {
    this.logs = this.logs.filter(log => log.simulationId !== simulationId);
  }
}