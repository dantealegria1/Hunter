/**
 * Tests for RetroAdsSidebar (TASK-08): retro banner, sponsor cards, and
 * affiliate deal links carrying rel="sponsored noopener".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import RetroAdsSidebar from '../../components/RetroAdsSidebar'
import * as cheapshark from '../../services/cheapshark'
import type { Deal } from '../../services/cheapshark'

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

describe('RetroAdsSidebar', () => {
  beforeEach(() => {
    vi.spyOn(cheapshark, 'getDeals').mockResolvedValue([
      makeDeal('d1', 'Hades', 12.5),
      makeDeal('d2', 'Portal', 5),
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the retro banner and sponsor cards', async () => {
    render(<RetroAdsSidebar />)
    expect(screen.getByRole('heading', { name: /hunter arcade/i })).toBeInTheDocument()
    expect(screen.getByText('PixelFuel Energy')).toBeInTheDocument()
    expect(screen.getByLabelText('Sponsored offers')).toBeInTheDocument()
  })

  it('lists affiliate deals with sponsored noopener links', async () => {
    render(<RetroAdsSidebar />)
    await waitFor(() => expect(screen.getByText('Hades')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /hades/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('sponsored')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link).toHaveAttribute(
      'href',
      'https://www.cheapshark.com/redirect?dealID=d1',
    )
    expect(screen.getAllByText('-50%').length).toBe(2)
  })

  it('shows an error state when deals fail to load', async () => {
    vi.spyOn(cheapshark, 'getDeals').mockRejectedValue(
      new cheapshark.CheapSharkError('API unavailable'),
    )
    render(<RetroAdsSidebar />)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('API unavailable'),
    )
  })
})
