import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('heading', { name: /hunter/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /backlog/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /deal radar/i })).toBeInTheDocument()
  })

  it('adding a game updates the backlog and the roadmap plan', async () => {
    render(<App />)
    expect(screen.getByText(/no games in your backlog/i)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Game title'), { target: { value: 'Celeste' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 20'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /add game/i }))

    expect(screen.getByText('Backlog (1)')).toBeInTheDocument()
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
    await waitFor(() => expect(screen.getByText('Hades')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Add Hades to backlog' }))

    expect(screen.getByText('Backlog (1)')).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.entries?.[0]).toMatchObject({ id: 'deal-d1', title: 'Hades' })
  })

  it('does not duplicate an entry when adding the same deal twice', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('Portal')).toBeInTheDocument())
    const button = screen.getByRole('button', { name: 'Add Portal to backlog' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.getByText('Backlog (1)')).toBeInTheDocument()
  })

  it('removing a game clears it from the backlog and storage', async () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('Game title'), { target: { value: 'Celeste' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 20'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /add game/i }))
    expect(screen.getByText('Backlog (1)')).toBeInTheDocument()

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
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('API unavailable'))
  })
})
