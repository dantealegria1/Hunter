/**
 * Integration tests for the TASK-08 responsive 3-column dashboard:
 * grid tracks (Codex | center views | RetroAds), drawer toggles below
 * the xl breakpoint, and stable center column (no layout shift).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from '../App'
import * as cheapshark from '../services/cheapshark'
import type { Deal } from '../services/cheapshark'

function makeDeal(id: string, title: string, price: number): Deal {
  return {
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
  }
}

const GRID_CLASS =
  'lg:grid-cols-[300px_minmax(0,1fr)_300px] xl:grid-cols-[320px_minmax(0,1fr)_320px]'

describe('App dashboard layout (TASK-08)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(cheapshark, 'getDeals').mockResolvedValue([
      makeDeal('d1', 'Hades', 12.5),
      makeDeal('d2', 'Portal', 5),
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a responsive 3-column grid with fixed sidebars and fluid center', () => {
    const { container } = render(<App />)
    const grid = container.querySelector('.grid')
    expect(grid).not.toBeNull()
    // Single-column base + fixed side / fluid center tracks at lg and xl.
    expect(grid).toHaveClass('grid-cols-1')
    for (const cls of GRID_CLASS.split(' ')) {
      expect(grid).toHaveClass(cls)
    }
  })

  it('places GameCodex, main views, and RetroAdsSidebar in the three columns', () => {
    render(<App />)
    const codexPanel = document.getElementById('codex-panel')
    const adsPanel = document.getElementById('ads-panel')
    expect(codexPanel).not.toBeNull()
    expect(adsPanel).not.toBeNull()
    expect(within(codexPanel!).getByText(/game codex/i)).toBeInTheDocument()
    expect(
      within(adsPanel!).getByRole('complementary', { name: 'Sponsored offers' }),
    ).toBeInTheDocument()
    // Center column is <main> holding all primary views.
    const main = screen.getByRole('main')
    expect(within(main).getByText(/backlog \(0\)/i)).toBeInTheDocument()
    expect(within(main).getByText('Roadmap')).toBeInTheDocument()
    expect(
      within(main).getByRole('region', { name: /deal radar/i }),
    ).toBeInTheDocument()
  })

  it('shows drawer toggles with correct aria wiring', () => {
    render(<App />)
    const codexToggle = screen.getByRole('button', { name: /codex/i })
    const adsToggle = screen.getByRole('button', { name: /deals & ads/i })
    expect(codexToggle).toHaveAttribute('aria-controls', 'codex-panel')
    expect(adsToggle).toHaveAttribute('aria-controls', 'ads-panel')
    expect(codexToggle).toHaveAttribute('aria-expanded', 'false')
    expect(adsToggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles the Codex drawer open and closed without opening both drawers', () => {
    render(<App />)
    const codexPanel = document.getElementById('codex-panel')!
    const adsPanel = document.getElementById('ads-panel')!
    const codexToggle = screen.getByRole('button', { name: /codex/i })

    expect(codexPanel).toHaveClass('hidden')
    fireEvent.click(codexToggle)
    expect(codexPanel).not.toHaveClass('hidden')
    expect(codexToggle).toHaveAttribute('aria-expanded', 'true')

    // Opening Ads closes Codex (mutually exclusive drawers).
    fireEvent.click(screen.getByRole('button', { name: /deals & ads/i }))
    expect(codexPanel).toHaveClass('hidden')
    expect(adsPanel).not.toHaveClass('hidden')

    fireEvent.click(screen.getByRole('button', { name: /deals & ads/i }))
    expect(adsPanel).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: /deals & ads/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('keeps drawer state independent of the grid columns (no layout shift)', () => {
    const { container } = render(<App />)
    const gridBefore = container.querySelector('.grid')!.className
    fireEvent.click(screen.getByRole('button', { name: /codex/i }))
    const gridAfter = container.querySelector('.grid')!.className
    expect(gridAfter).toBe(gridBefore)
  })
})
