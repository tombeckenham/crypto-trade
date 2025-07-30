# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FluxTrade is a high-performance trading system demonstrating ultra-high volume order processing with sub-millisecond latency. The system uses a Fastify backend with TypeScript and a Vite + React + TypeScript frontend.

## Architecture

### Backend (Port 3001)
- **Framework**: Fastify with TypeScript
- **Key Components**:
  - `OrderBook`: In-memory order book using red-black trees for O(log n) operations
  - `MatchingEngine`: Single-threaded matching engine optimized for event loop
  - `MarketDataBroadcaster`: WebSocket message broadcasting with connection pooling
  - `RiskManager`: Real-time risk calculations and position management
  - `MetricsCollector`: Performance monitoring with histograms and counters

### Frontend (Port 5173)
- **Framework**: Vite + React + TypeScript
- **Key Features**:
  - Real-time order book visualization
  - WebSocket connection for live market data
  - Performance metrics dashboard
  - Market depth charts using lightweight-charts

## Performance Requirements

- Order processing: < 1ms average latency
- WebSocket throughput: 10,000+ messages per second
- Concurrent connections: 1,000+ WebSocket connections
- Memory usage: Optimized for minimal GC pressure

## API Structure

### REST Endpoints
- `POST /api/orders` - Place new order
- `DELETE /api/orders/:id` - Cancel order
- `GET /api/orderbook/:symbol` - Get current order book
- `GET /api/trades/:symbol` - Recent trades
- `GET /api/portfolio` - User portfolio
- `GET /api/metrics` - System performance metrics

### WebSocket Endpoints
- `/ws/market` - Real-time market data
- `/ws/orders` - User-specific order updates

## Data Models

### Order
```typescript
{
  id: string (UUID),
  symbol: string,
  side: "buy" | "sell",
  price: number,
  quantity: number,
  type: "market" | "limit",
  timestamp: number,
  userId: string
}
```

### Trade
```typescript
{
  id: string,
  symbol: string,
  price: number,
  quantity: number,
  timestamp: number,
  takerSide: "buy" | "sell"
}
```

## Performance Optimization Guidelines

### Backend
- Use Node.js cluster module for multi-core utilization
- Implement object pooling to reduce GC pressure
- Use efficient serialization (msgpack over JSON where appropriate)
- Custom logger with async batching
- Set/Map for O(1) lookups
- Avoid array operations in hot paths
- Use Buffer for binary data

### Frontend
- Virtual scrolling for large order books
- Debounced updates to prevent UI flooding
- Canvas-based rendering for high-frequency updates
- WebWorkers for data processing if needed
- Memoization for expensive calculations

## Code Standards

- TypeScript strict mode enabled
- ESLint with performance-focused rules
- Clear separation of concerns
- Performance-critical sections clearly marked
- No comments unless specifically requested by user

## TypeScript Guidelines

- Avoid using any type and avoid casting type
- Try to correct the type at the source

## Package Management

- Always use pnpm, and when adding modules use pnpm add instead of altering the package.json

## Development Commands

### Backend
```bash
cd backend
pnpm install       # Install dependencies
pnpm dev          # Run development server (port 3001)
pnpm build        # Build for production
pnpm start        # Run production server
pnpm typecheck    # Run TypeScript type checking
```

### Frontend
```bash
cd frontend
pnpm install      # Install dependencies
pnpm dev          # Run development server (port 5173)
pnpm build        # Build for production
pnpm preview      # Preview production build
```

## React Rules for Optimal Code Quality

### 1. Use as little React as possible
- Keep components small - less than 100 lines
- Views reference components
- Remove as much logic as possible from components and views
- Externalize functions and keep external functions vanilla TypeScript
- Vanilla TypeScript is easier to test and package for other uses

### 2. Avoid using useEffect
- Avoid using useEffect to fetch data or initialize state
- Use hooks, tanstack query, or the new `use` feature in React 19
- Use useEffect to update state when something else changes

### 3. Use useState sparingly
- Using a local variable is often more optimal - even if something has to be calculated
- useState uses reducers under the hood
- If you have more than 3 useStates you might as well use reducers

### 4. Use React.FC and expand props
- Expand props so that each parameter is named
- It's easier to know which props are not used

### 5. Avoid globals and global state
- Globals including auth globals, often lead to race conditions
- Global state is only useful in rare cases - SPAs with significant complexity
- Start with reducers which are passed through props
- If that's too complicated, use React context
- As a last resort for very complicated SPAs - use zustand

### 6. Use reducers
- Reducers are great - read up on them and understand them
- They keep all state update logic in one place
- They are vanilla TypeScript - keep them that way
- Use them to update state based on other state
- Note that updating any part of the state returned from a reducer will cause a re-render if the whole state is a parameter - you can pass just parts of it

### 7. Avoid passing style to components
- Avoid passing styles to components, or styling your components in views
- Create a component that is pre-styled
- Create variants - e.g. small, medium, large - rather than size={18}
- Avoid using styles in views as much as possible

### 8. Use the theme
- Create constants for your theme or use a consistent structure
- Use the theme fonts and colors
- Avoid naming fonts and including color values directly in views and components

### 9. Use flexbox
- Use flexbox for every component

### 10. Avoid margin
- Don't pre-add padding or margin to the outside of components, unless there is a specific reason to
- Use flexbox gap instead

### 11. Use kebab-case for file names
- Use PascalCase for component names, but kebab-case for file names
- PascalCase can often give you issues in git as case sensitive file names is not supported on all platforms

### 12. Create a component library
- If using a 3rd party component library, wrap those components then include your wrapped components. It makes it easier to change libraries
- Shadcn makes this easy - it includes the source in your repo, and imports only primitives from that source
- You don't need to wrap Shadcn generated components - just edit the component source with your changes
- Don't create duplicates of components for minor variations. Create a variation
- Customize the component if there's a new variation - don't style from the outside
- Put your components into a high level components folder
- Use aliases or subpath imports "~" to import components from views

### 13. Avoid hard coding width or height
- Use flexbox and create rules for screen sizes

### 14. Use a prop to hide
- Avoid code that conditionally shows a complex component - this creates janky UI
- Instead use the display CSS property to hide or show - this will precalculate everything in the component but not render it

### 15. Use eslint or equivalent
- Ensure the rules of hooks linting rule is on

### 16. Views are routes
- All views should be routable - meaning you can get to them via a route
- No view should rely on variables or parameters from another
- A view can be accessed in any order
- Pass params on the URL. You can use URL segments for IDs, search params should be optional
- Name views with the same name as the route - or place in a folder with that name

### 17. Avoid default exports
- It's more efficient to export the component directly than to import a default
- Avoid barreled imports as much as possible unless you are planning to package that library for others for the front end. Make a note of that in the claude.md file