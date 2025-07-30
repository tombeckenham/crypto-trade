# Railway Multi-Server Deployment Guide

## Services to Deploy

### 1. Main Trading Server (Backend)
- **Directory**: `backend/`
- **Port**: 3001
- **Service Name**: `fluxtrade-backend`

### 2. Simulation Server
- **Directory**: `simulation-server/`
- **Port**: 3002  
- **Service Name**: `fluxtrade-simulation`

### 3. Frontend
- **Directory**: `frontend/`
- **Port**: 5173
- **Service Name**: `fluxtrade-frontend`

## Railway Configuration Steps

### Step 1: Deploy Main Backend
```bash
cd backend
railway login
railway link
railway up
```

### Step 2: Deploy Simulation Server
```bash
cd ../simulation-server
railway login
# Create new service
railway service create fluxtrade-simulation
railway link fluxtrade-simulation
railway up
```

### Step 3: Deploy Frontend
```bash
cd ../frontend
railway login
railway service create fluxtrade-frontend
railway link fluxtrade-frontend
railway up
```

## Environment Variables Configuration

### Main Backend Service Variables
```env
NODE_ENV=production
PORT=3001
SIMULATION_SERVER_URL=https://fluxtrade-simulation.railway.app
PUBLIC_URL=https://fluxtrade-backend.railway.app
NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"
```

### Simulation Server Variables
```env
NODE_ENV=production
PORT=3002
MAIN_SERVER_URL=https://fluxtrade-backend.railway.app
NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"
LOG_LEVEL=info
UV_THREADPOOL_SIZE=16
```

### Frontend Variables
```env
VITE_API_URL=https://fluxtrade-backend.railway.app/api
VITE_WS_URL=wss://fluxtrade-backend.railway.app
```

## Service Communication Flow

1. **Frontend** → **Main Backend** (Port 3001)
2. **Main Backend** → **Simulation Server** (Port 3002) for high-volume simulations
3. **Simulation Server** → **Main Backend** (sends generated orders back)

## Automatic Simulation Delegation

- Simulations **≤10K orders/sec**: Run on main backend
- Simulations **>10K orders/sec**: Automatically delegated to simulation server
- **Fallback**: If simulation server unavailable, runs locally with memory protection

## Health Checks

- **Backend**: `GET /api/health`
- **Simulation**: `GET /health`
- **Frontend**: Standard Vite health check

## Memory Limits

- **Backend**: 4GB heap (handles live trading + small simulations)
- **Simulation**: 2GB heap (optimized for high-volume order generation)
- **Frontend**: Standard Vite limits

## Monitoring

- **Backend Stats**: `GET /api/engine/stats`
- **Simulation Stats**: `GET /api/stats`
- Memory usage logged every 5 seconds
- Automatic garbage collection at 3.5GB+ usage

## Scaling Strategy

1. **Horizontal**: Deploy multiple simulation servers
2. **Load Balancing**: Use Railway's built-in load balancing
3. **Geographic**: Deploy simulation servers in different regions
4. **Auto-scaling**: Railway handles container scaling based on CPU/memory