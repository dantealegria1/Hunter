import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DurationPromptModal from '../../components/DurationPromptModal'
import GameCodex from '../../components/GameCodex'
import * as cheapshark from '../../services/cheapshark'
import * as rawg from '../../services/rawg'

describe('DurationPromptModal', () => {
  it('prefills with a known estimate and confirms on submit', () => {
    const onConfirm = vi.fn()
    render(
      <DurationPromptModal
        open
        gameTitle="Elden Ring"
        initialHours={60}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    const input = screen.getByLabelText(/hours to beat/i) as HTMLInputElement
    expect(input.value).toBe('60')
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith(60)
  })

  it('falls back to 20 hours when nothing is known', () => {
    const onConfirm = vi.fn()
    render(
      <DurationPromptModal
        open
        gameTitle="Unknown"
        initialHours={20}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    expect((screen.getByLabelText(/hours to beat/i) as HTMLInputElement).value).toBe('20')
  })

  it('cancels via Escape and Cancel without confirming', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <DurationPromptModal open gameTitle="X" initialHours={20} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('rejects values below the minimum', () => {
    const onConfirm = vi.fn()
    render(<DurationPromptModal open gameTitle="X" initialHours={0.5} onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText(/hours to beat/i), { target: { value: '0.2' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('GameCodex', () => {
  const results = [
    {
      gameID: '1',
      steamAppID: '367520',
      cheapest: 9.99,
      external: 'Hollow Knight',
      internalName: 'hollow knight',
      thumb: '',
    },
  ]

  it('shows idle prompt and only searches after 3+ characters', async () => {
    const spy = vi.spyOn(cheapshark, 'searchGames').mockResolvedValue(results)
    render(<GameCodex onAddToBacklog={() => {}} />)
    expect(screen.getByText(/type at least/i)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('e.g. Hollow Knight'), { target: { value: 'ho' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(spy).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('searches debounced, lists results, loads details, and adds through the modal', async () => {
    vi.spyOn(cheapshark, 'searchGames').mockResolvedValue(results)
    vi.spyOn(cheapshark, 'getGameInfo').mockResolvedValue({
      info: {
        title: 'Hollow Knight',
        thumb: '',
        cheapestPrice: { price: '7.50', date: '2017-02-24' },
      },
      deals: [{ storeID: '1', dealID: 'x', price: 9.99, retailPrice: 14.99, savings: 33 }],
      steamRatingText: 'Overwhelmingly Positive',
      steamRatingPercent: '97',
      metacriticScore: '87',
    })
    vi.spyOn(rawg, 'lookupGame').mockResolvedValue(null)
    const onAdd = vi.fn()
    render(<GameCodex onAddToBacklog={onAdd} />)

    fireEvent.change(screen.getByPlaceholderText('e.g. Hollow Knight'), { target: { value: 'hollow' } })
    // Debounce: no call before ~300ms.
    expect(cheapshark.searchGames).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Hollow Knight')).toBeInTheDocument())
    expect(screen.queryByRole('status')).toBeNull() // loading state cleared

    fireEvent.click(screen.getByText('Hollow Knight'))
    await waitFor(() =>
      expect(screen.getByText(/overwhelmingly positive/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/release/i)).toHaveTextContent('Release')
    expect(screen.getByText('2017')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add to backlog/i }))
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    expect(dialog).toHaveTextContent('Estimated playtime')
    // Prefilled with the 20h fallback (RAWG returned nothing).
    expect((screen.getByLabelText(/hours to beat/i) as HTMLInputElement).value).toBe('20')
    fireEvent.change(screen.getByLabelText(/hours to beat/i), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'codex-1', title: 'Hollow Knight', hoursToBeat: 40 }),
      ),
    )
    vi.restoreAllMocks()
  })

  it('shows an empty state when no games match', async () => {
    vi.spyOn(cheapshark, 'searchGames').mockResolvedValue([])
    render(<GameCodex onAddToBacklog={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Hollow Knight'), { target: { value: 'zzzzz' } })
    await waitFor(() =>
      expect(screen.getByText(/no games match your search/i)).toBeInTheDocument(),
    )
    vi.restoreAllMocks()
  })

  it('shows an error state when the search fails', async () => {
    vi.spyOn(cheapshark, 'searchGames').mockRejectedValue(new cheapshark.CheapSharkError('HTTP 500', 500))
    render(<GameCodex onAddToBacklog={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Hollow Knight'), { target: { value: 'hollow' } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('HTTP 500'))
    vi.restoreAllMocks()
  })
})
