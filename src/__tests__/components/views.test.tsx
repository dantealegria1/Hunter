import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BacklogManager from '../../components/BacklogManager'
import RoadmapTimeline from '../../components/RoadmapTimeline'
import DealRadar from '../../components/DealRadar'
import { buildPlayPlan, type BacklogEntry } from '../../services/planner'
import * as cheapshark from '../../services/cheapshark'

const entries: BacklogEntry[] = [
  { id: 'a', title: 'Elden Ring', hoursToBeat: 60, priority: 'high' },
  { id: 'b', title: 'Stardew Valley', hoursToBeat: 40, hoursPlayed: 30, priority: 'low' },
]

describe('BacklogManager', () => {
  it('renders entries with remaining hours and priority', () => {
    render(<BacklogManager entries={entries} onAdd={() => {}} onRemove={() => {}} />)
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
    expect(screen.getByText(/10h remaining/)).toBeInTheDocument()
    expect(screen.getAllByText('high').length).toBeGreaterThan(0)
  })

  it('adds a valid entry via the form', () => {
    const onAdd = vi.fn()
    render(<BacklogManager entries={[]} onAdd={onAdd} onRemove={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Game title'), { target: { value: 'Hollow Knight' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 20'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: /add game/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    const call = onAdd.mock.calls[0]?.[0] as BacklogEntry
    expect(call.title).toBe('Hollow Knight')
    expect(call.hoursToBeat).toBe(25)
    expect(call.priority).toBe('medium')
  })

  it('shows a validation error for missing title', () => {
    render(<BacklogManager entries={[]} onAdd={() => {}} onRemove={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 20'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: /add game/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
  })

  it('removes an entry', () => {
    const onRemove = vi.fn()
    render(<BacklogManager entries={entries} onAdd={() => {}} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Stardew Valley' }))
    expect(onRemove).toHaveBeenCalledWith('b')
  })
})

describe('RoadmapTimeline', () => {
  it('renders the schedule table for planned games with finish dates', () => {
    const plan = buildPlayPlan(entries, 10)
    render(<RoadmapTimeline plan={plan} startDate={new Date('2026-01-01T00:00:00Z')} />)
    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
    expect(screen.getByText('Stardew Valley')).toBeInTheDocument()
    // Weekly bar chart present
    expect(screen.getByRole('img', { name: /weekly planned hours/i })).toBeInTheDocument()
  })

  it('shows empty state when no games are planned', () => {
    const plan = buildPlayPlan([], 10)
    render(<RoadmapTimeline plan={plan} />)
    expect(screen.getByText(/add games to your backlog/i)).toBeInTheDocument()
  })
})

describe('DealRadar', () => {
  it('loads deals and supports adding one to the backlog', async () => {
    const deal = {
      dealID: 'd1',
      title: 'Celeste',
      salePrice: 4.99,
      normalPrice: 19.99,
      savingsPercent: 75,
      thumb: '',
      storeID: '1',
      metacriticScore: '',
      releaseDate: 0,
      lastChange: 0,
      isOnSale: true,
      internalName: 'celeste',
      rating: '',
      steamRatingCount: '100',
      steamRatingPercent: '95',
      dealRating: '9',
    }
    vi.spyOn(cheapshark, 'getDeals').mockResolvedValue([deal])
    const onAdd = vi.fn()
    render(<DealRadar onAddToBacklog={onAdd} />)
    await waitFor(() => expect(screen.getByText('Celeste')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Add Celeste to backlog' }))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'deal-d1', title: 'Celeste', priority: 'high' }),
    )
    vi.restoreAllMocks()
  })

  it('filters deals by search query and max price', async () => {
    const makeDeal = (id: string, title: string, price: number) => ({
      dealID: id,
      title,
      salePrice: price,
      normalPrice: price * 2,
      savingsPercent: 50,
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
    })
    vi.spyOn(cheapshark, 'getDeals').mockResolvedValue([
      makeDeal('1', 'Hades', 12.5),
      makeDeal('2', 'Portal', 5),
    ])
    render(<DealRadar onAddToBacklog={() => {}} />)
    await waitFor(() => expect(screen.getByText('Hades')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Filter by title'), { target: { value: 'portal' } })
    expect(screen.queryByText('Hades')).not.toBeInTheDocument()
    expect(screen.getByText('Portal')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
