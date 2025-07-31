# CryptoTrade - Ultra-High Performance Cryptocurrency Trading System

CryptoTrade is a high-performance cryptocurrency trading system demonstrating ultra-high volume order processing with sub-millisecond latency. Built with TypeScript, it showcases advanced algorithmic trading concepts, real-time market data streaming, and optimized data structures for financial applications.

## 🚀 What This System Demonstrates

### Performance & Scalability
- **Sub-millisecond order processing** using optimized Red-Black tree data structures
- **50,000+ orders per second** processing capability with circuit breaker protection
- **10,000+ WebSocket messages per second** real-time market data streaming
- **1,000+ concurrent WebSocket connections** with connection pooling
- **Memory-optimized operations** with object pooling and garbage collection pressure reduction

### Advanced Trading Features
- **Matching Engine**: Price-time priority algorithm with maker/taker fee calculations
- **Order Book Management**: Live order book with real-time depth visualization
- **Multi-pair Trading**: Isolated order books for different cryptocurrency pairs
- **Risk Management**: Real-time position tracking and risk calculations
- **Market Data**: Live price feeds, trade history, and volume metrics

### Technical Architecture
- **Microservices Design**: Separate backend, frontend, and simulation services
- **Event-Driven Architecture**: Real-time updates via WebSocket events
- **High-Performance Data Structures**: Red-Black trees for O(log n) operations
- **Production-Ready Monitoring**: Performance metrics, health checks, and logging

## 🏗️ Architecture Overview

### Backend Service (Port 3001)
The core trading engine built with **Fastify + TypeScript**:

#### Key Components
- **MatchingEngine**: Single-threaded matching engine optimized for the Node.js event loop
- **OrderBook**: In-memory order book using Red-Black trees for O(log n) insertions/deletions
- **WebSocketService**: Real-time market data broadcasting with connection pooling
- **RiskManager**: Real-time risk calculations and position management
- **MetricsCollector**: Performance monitoring with histograms and counters

#### Performance Features
- O(log n) order insertion/cancellation via Red-Black trees
- O(1) best bid/ask price retrieval
- Memory-efficient with automatic cleanup of filled orders
- Circuit breaker protection against order flooding
- Object pooling to minimize garbage collection pressure

### Frontend (Port 5173)
Real-time trading interface built with **Vite + React + TypeScript**:
- Live order book visualization with depth charts
- Real-time WebSocket connections for market data
- Performance metrics dashboard
- Trading form with order placement/cancellation

### Simulation Server (Port varies)
High-volume market data generator for testing and demonstration:
- Configurable volume market data generation
- Trading simulation with object pooling
- Performance logging and metrics collection

## 📊 API Documentation

### REST Endpoints

#### Trading Operations
- `POST /api/orders` - Place new order (market/limit)
- `DELETE /api/orders/:id` - Cancel existing order
- `GET /api/orders/:userId` - Get user orders

#### Market Data  
- `GET /api/orderbook/:pair` - Get current order book snapshot
- `GET /api/trades/:pair` - Recent trade history
- `GET /api/portfolio/:userId` - User portfolio and positions

#### System Monitoring
- `GET /api/health` - System health check
- `GET /api/metrics` - Performance metrics and statistics

#### Simulation Control
- `POST /api/simulation/start` - Start market data simulation
- `POST /api/simulation/stop` - Stop simulation
- `POST /api/simulation/generate-liquidity` - Generate liquidity for testing

### WebSocket Endpoints
- `/ws/market` - Real-time market data (trades, order book updates, tickers)
- `/ws/orders` - User-specific order updates (fills, cancellations)

### API Authentication
Protected endpoints require API key in `X-API-Key` header:
- `SIMULATION_API_KEY` - For simulation server access
- `FRONTEND_API_KEY` - For frontend application access

## 🔧 Installation & Setup

### Prerequisites
- **Node.js** >= 22.0.0
- **pnpm** package manager
- **TypeScript** for development

### Quick Start

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd crypto-trade
pnpm install
```

2. **Configure environment variables:**
```bash
# Create .env file in backend directory
cd backend
cp .env.example .env  # Configure API keys and settings
```

3. **Start all services:**
```bash
# Terminal 1 - Backend
cd backend
pnpm dev

# Terminal 2 - Frontend  
cd frontend
pnpm dev

# Terminal 3 - Simulation Server (optional)
cd simulation-server
pnpm dev
```

4. **Access the application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001/api
- API Documentation: http://localhost:3001/docs
- WebSocket: ws://localhost:3001/ws/market

## 🚀 Usage Examples

### Placing Orders
```javascript
// Market Buy Order
const order = {
  pair: "BTC/USDT",
  side: "buy",
  type: "market",
  amount: "0.001",
  userId: "user123"
};

const response = await fetch('/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify(order)
});
```

### WebSocket Market Data
```javascript
const ws = new WebSocket('ws://localhost:3001/ws/market');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'trade':
      console.log('New trade:', data.data);
      break;
    case 'orderbook_update':
      console.log('Order book update:', data.data);
      break;
    case 'ticker':
      console.log('Price ticker:', data.data);
      break;
  }
};
```

## 🧪 Testing & Development

### Backend Testing
```bash
cd backend
pnpm test                    # Run unit tests
pnpm test:performance        # Run performance benchmarks
pnpm test:coverage          # Generate coverage report
pnpm test:ui                # Interactive test runner
```

### Performance Benchmarks
The system includes comprehensive performance tests:
- Order placement latency (target: <1ms)
- Order book operations (target: <0.1ms)
- WebSocket message throughput (target: 10k+ msg/sec)
- Memory usage and garbage collection impact

### Development Commands
```bash
# Backend
pnpm dev          # Development with hot reload
pnpm build        # Production build
pnpm typecheck    # TypeScript validation

# Frontend
pnpm dev          # Development server
pnpm build        # Production build with typecheck
pnpm lint         # ESLint validation

# Simulation Server
pnpm dev          # Development with watch mode
pnpm start        # Production server
```

## 📈 Performance Characteristics

### Latency Targets
- Order processing: < 1ms average
- Best bid/ask retrieval: < 0.1ms
- WebSocket message delivery: < 5ms
- Order book updates: < 0.5ms

### Throughput Targets
- Orders per second: 50,000+
- WebSocket messages per second: 10,000+
- Concurrent connections: 1,000+
- Trade matching rate: 25,000+ trades/sec

### Memory Optimization
- Object pooling for order instances
- Automatic cleanup of filled orders
- Circular buffers for trade history
- Connection pooling for WebSocket management

## 🔒 Security Features

- API key authentication for protected endpoints
- Rate limiting on public endpoints (100 req/min)
- CORS configuration for production deployments
- Input validation and sanitization
- Circuit breaker pattern for system protection

## 🚀 Production Deployment

### Environment Configuration
```bash
# Production environment variables
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
SIMULATION_API_KEY=your-simulation-key
FRONTEND_API_KEY=your-frontend-key
HIDE_LOGS=true  # Reduce log verbosity
```

### Railway Deployment
The system is configured for Railway deployment with:
- `railway.json` configuration files
- Production-optimized Docker builds
- Automatic HTTPS and domain configuration
- Environment variable management

## 📝 Project Structure

```
crypto-trade/
├── backend/              # Trading engine and API
│   ├── src/
│   │   ├── core/        # Order book and matching engine
│   │   ├── api/         # REST API routes
│   │   ├── services/    # WebSocket and market data services
│   │   └── utils/       # Utilities and object pooling
│   └── dist/            # Compiled JavaScript
├── frontend/            # React trading interface
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── services/    # API and WebSocket clients
│   │   └── views/       # Application views
│   └── dist/            # Built frontend assets
├── simulation-server/   # Market data generator
│   └── src/             # Simulation logic and data generation
└── shared/              # Shared TypeScript types
    └── types/           # Common type definitions
```

## 🤝 Contributing

This is a demonstration project showcasing high-performance trading system architecture. Key areas for exploration:

1. **Algorithm Optimization**: Improve matching engine performance
2. **Market Making**: Add automated market maker strategies  
3. **Risk Management**: Enhanced position and risk calculations
4. **Monitoring**: Additional performance metrics and alerting
5. **Testing**: Extended performance and stress testing

## 📄 License

MIT License - See LICENSE file for details

---

*This system demonstrates advanced concepts in high-frequency trading, real-time data processing, and performance optimization. It serves as an educational resource for understanding the technical challenges in building financial trading infrastructure.*