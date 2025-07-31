#!/bin/bash

# CryptoTrade Multi-Server Railway Deployment Script
set -e

echo "🚀 CryptoTrade Multi-Server Deployment to Railway"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found. Please install it first:"
    echo -e "npm install -g @railway/cli${NC}"
    exit 1
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️ Not logged in to Railway. Please run: railway login${NC}"
    exit 1
fi

# Check if we're linked to a project, if not initialize one
if ! railway status &> /dev/null; then
    echo -e "${YELLOW}🔗 No project linked. Creating new project...${NC}"
    railway init cryptotrade
fi

echo -e "${BLUE}📦 Building and deploying services...${NC}"

# Deploy Backend
echo -e "\n${YELLOW}1️⃣ Deploying Main Backend Server...${NC}"
cd backend
echo "   - Building backend..."
pnpm install
pnpm build

# Create or link backend service
echo "   - Creating backend service..."
railway add --service cryptotrade-backend

railway up
BACKEND_URL=$(railway domain)
echo -e "${GREEN}✅ Backend deployed at: ${BACKEND_URL}${NC}"

# Deploy Simulation Server
echo -e "\n${YELLOW}2️⃣ Deploying Simulation Server...${NC}"
cd ../simulation-server
echo "   - Building simulation server..."
pnpm install
pnpm build

# Create simulation service
echo "   - Creating simulation service..."
railway add --service cryptotrade-simulation

# Set environment variables for simulation server
echo "   - Setting environment variables..."
railway variables set MAIN_SERVER_URL=${BACKEND_URL}
railway variables set NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"
railway variables set LOG_LEVEL=info
railway variables set UV_THREADPOOL_SIZE=16

railway up
SIMULATION_URL=$(railway domain)
echo -e "${GREEN}✅ Simulation Server deployed at: ${SIMULATION_URL}${NC}"

# Update Backend with Simulation URL
echo -e "\n${YELLOW}3️⃣ Configuring Backend with Simulation Server...${NC}"
cd ../backend
railway variables set SIMULATION_SERVER_URL=${SIMULATION_URL}
railway variables set PUBLIC_URL=${BACKEND_URL}
railway variables set NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"

echo "   - Redeploying backend with updated configuration..."
railway up
echo -e "${GREEN}✅ Backend updated with simulation server URL${NC}"

# Deploy Frontend
echo -e "\n${YELLOW}4️⃣ Deploying Frontend...${NC}"
cd ../frontend

# Create frontend service
echo "   - Creating frontend service..."
railway add --service cryptotrade-frontend

# Set frontend environment variables
echo "   - Setting environment variables..."
railway variables set VITE_API_URL=${BACKEND_URL}/api
railway variables set VITE_WS_URL=${BACKEND_URL/https/wss}

echo "   - Building and deploying frontend..."
railway up
FRONTEND_URL=$(railway domain)
echo -e "${GREEN}✅ Frontend deployed at: ${FRONTEND_URL}${NC}"

# Final Summary
echo -e "\n${GREEN}🎉 Deployment Complete!${NC}"
echo "=================================="
echo -e "${BLUE}Services Deployed:${NC}"
echo -e "🔧 Backend:     ${BACKEND_URL}"
echo -e "🎯 Simulation:  ${SIMULATION_URL}"
echo -e "🌐 Frontend:    ${FRONTEND_URL}"
echo ""
echo -e "${BLUE}Health Checks:${NC}"
echo -e "Backend:    ${BACKEND_URL}/api/health"
echo -e "Simulation: ${SIMULATION_URL}/health"
echo ""
echo -e "${BLUE}Simulation Features:${NC}"
echo -e "• High-volume simulations (>10K orders/sec) automatically use simulation server"
echo -e "• Fallback to main server if simulation server unavailable"
echo -e "• Memory protection on both servers"
echo -e "• Real-time monitoring and statistics"
echo ""
echo -e "${YELLOW}⚡ Ready for 100K+ orders per second testing!${NC}"

cd ..