export type BinanceKline = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  string, // quoteVolume
  number, // trades
  string, // takerBuyBaseVolume
  string, // takerBuyQuoteVolume
  string  // ignore
]

export interface CandlestickData {
  time: number
  open: number
  high: number
  low: number
  close: number
}

class BinanceAPIService {
  private readonly baseUrl = 'https://api.binance.com/api/v3'

  async getKlines(
    symbol: string,
    interval: string = '1m',
    limit: number = 100
  ): Promise<CandlestickData[]> {
    const url = `${this.baseUrl}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    console.log('Fetching from Binance:', url)
    
    try {
      const response = await fetch(url)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Binance API error:', response.status, errorText)
        throw new Error(`Binance API error: ${response.status} - ${errorText}`)
      }

      const data: BinanceKline[] = await response.json()

      return data.map((kline) => ({
        time: Math.floor(kline[0] / 1000),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
      })).filter(candle => 
        !isNaN(candle.time) && 
        !isNaN(candle.open) && 
        !isNaN(candle.high) && 
        !isNaN(candle.low) && 
        !isNaN(candle.close)
      )
    } catch (error) {
      console.error('Failed to fetch Binance data:', error)
      throw error
    }
  }

  convertPairToBinanceSymbol(pair: string): string {
    return pair.replace(/[-/]/g, '').toUpperCase()
  }
}

export const binanceAPI = new BinanceAPIService()