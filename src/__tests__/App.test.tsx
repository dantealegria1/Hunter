import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import App from '../App'
import { STORAGE_KEY } from '../services/storage'
import * as cheapshark from '../services/cheapshark'
import type { Deal } from '../services/cheapshark'

function makeDeal(id: string, title: string, price: number, savings: number): Deal {
  return {
    dealID: id,
    title,
    salePrice: price,
    normalPrice: price * 2,
    savingsPercent: savings,
    thumb: '',
    storeID: '1',
    metacriticScore: '',
    releaseDate: 0,
    lastChange: 0,
    isOnSale: true,
    internalName: title.toLowerCase(),
    rating: '',
    steamRatingCount: '10',
    steamRatingPercent: '90',
    dealRating: '8',
  }
}

describe('App dashboard integration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(cheapshark, 'getDeals').mockResolvedValue([
      makeDeal('d1', 'Hades', 12.5, 50),
      makeDeal('d2', 'Portal', 5, 80),
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all three views', () => {
    render(<App />)
    // The retro ads sidebar also mentions "Hunter" (arcade banner), so
    // scope the heading query to the app header.
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { name: /hunter/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /backlog/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /deal radar/i })).toBeInTheDocument()
  })

  it('adding a game updates the backlog and the roadmap plan', async () => {
    render(<App />)
    expect(screen.getByText(/no games in your backlog/i)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Game title'), { target: { value: 'Celeste' } })
    fireEvent.change(screen.getByPlaceholderText('auto (RAWG)'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /add game/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(screen.getByText(/backlog \(1\)/i)).toBeInTheDocument())
    expect(screen.getAllByText('Celeste').length).toBeGreaterThan(0)
    // Roadmap now shows a scheduled row instead of its empty state
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /weekly planned hours across 2 weeks/i })).toBeInTheDocument(),
    )
    // Persisted to localStorage
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.entries?.[0]?.title).toBe('Celeste')
  })

  it('adding a deal from DealRadar inserts it into the shared backlog', async () => {
    render(<App />)
    // The retro ads sidebar also lists deals, so scope to the Deal Radar region.
    const dealRadar = within(screen.getByRole('region', { name: /deal radar/i }))
    await waitFor(() => expect(dealRadar.getByText('Hades')).toBeInTheDocument())
    fireEvent.click(dealRadar.getByRole('button', { name: 'Add Hades to backlog' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(screen.getByText('Backlog (1)')).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.entries?.[0]).toMatchObject({ id: 'cs-d1', title: 'Hades' })
  })

  it('does not duplicate an entry when adding the same deal twice', async () => {
    render(<App />)
    // Scope to the Deal Radar region: the ads sidebar may repeat deal titles.
    const dealRadar = within(screen.getByRole('region', { name: /deal radar/i }))
    await waitFor(() => expect(dealRadar.getByText('Portal')).toBeInTheDocument())
    const button = dealRadar.getByRole('button', { name: 'Add Portal to backlog' })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(screen.getByText('Backlog (1)')).toBeInTheDocument()
  })

  it('removing a game clears it from the backlog and storage', async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('Game title'), { target: { value: 'Celeste' } })
    fireEvent.change(screen.getByPlaceholderText('auto (RAWG)'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /add game/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(screen.getByText('Backlog (1)')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Remove Celeste' }))
    expect(screen.getByText('Backlog (0)')).toBeInTheDocument()
    expect(screen.getByText(/add games to your backlog to see a play roadmap/i)).toBeInTheDocument()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.entries).toHaveLength(0)
  })

  it('shows the deals error state when fetching fails', async () => {
    vi.restoreAllMocks()
    vi.spyOn(cheapshark, 'getDeals').mockRejectedValue(new cheapshark.CheapSharkError('API unavailable'))
    render(<App />)
    // Both DealRadar and the retro ads sidebar surface deal errors; assert
    // that at least one alert carries the failure message.
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('API unavailable'))).toBe(true)
    })
  })
})
