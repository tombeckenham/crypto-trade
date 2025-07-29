import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradingView } from './views/trading-view';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TradingView />
    </QueryClientProvider>
  );
}

export default App;