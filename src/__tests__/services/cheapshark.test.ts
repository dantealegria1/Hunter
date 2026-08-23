import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CheapSharkError,
  getDeals,
  getStores,
  searchGames,
  type Deal,
  type GameLookupResult,
  type Store,
} from '../../services/cheapshark';

const rawDeal: Record<string, unknown> = {
  dealID: 'deal-1',
  gameID: 'game-1',
  steamAppID: '570',
  title: 'Dota 2',
  salePrice: '9.99',
  normalPrice: '39.99',
  savings: '75.0198',
  thumb: 'https://example.com/thumb.png',
  storeID: '1',
  metacriticScore: '90',
  releaseDate: '1376527200',
  lastChange: '1690000000',
  isOnSale: '1',
  internalName: 'DOTA2',
  rating: '4.5',
  steamRatingCount: '1000000',
  steamRatingPercent: '85',
  steamRatingText: 'Very Positive',
  dealRating: '9.5',
};

const game: GameLookupResult = {
  gameID: '128',
  steamAppID: '570',
  cheapest: '9.99' as unknown as number,
  external: 'Dota 2',
  internalName: 'DOTA2',
  thumb: 'https://example.com/thumb.png',
};

const store: Store = {
  storeID: '1',
  storeName: 'Steam',
  isActive: 1 as unknown as boolean,
  images: { banner: 'b.png', logo: 'l.png', icon: 'i.png' },
};

function mockFetchOnce(payload: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDeals', () => {
  it('requests the /deals endpoint and coerces numeric fields', async () => {
    const fetchMock = mockFetchOnce([rawDeal]);

    const deals = await getDeals({ storeID: '1', onSaleOnly: true, pageSize: 20 });

    expect(deals).toHaveLength(1);
    const deal: Deal = deals[0]!;
    expect(deal.salePrice).toBe(9.99);
    expect(deal.normalPrice).toBeCloseTo(39.99);
    expect(deal.savingsPercent).toBeCloseTo(75.0198);
    expect(deal.isOnSale).toBe(true);
    expect(deal.releaseDate).toBe(1376527200);
    expect(deal.title).toBe('Dota 2');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://www.cheapshark.com/api/1.0/deals');
    expect(url).toContain('storeID=1');
    expect(url).toContain('onSale=true');
    expect(url).toContain('pageSize=20');
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it('omits unset query params', async () => {
    const fetchMock = mockFetchOnce([]);
    await getDeals();

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe('https://www.cheapshark.com/api/1.0/deals');
  });

  it('throws CheapSharkError with status on HTTP failure', async () => {
    mockFetchOnce({}, false, 404);

    await expect(getDeals()).rejects.toMatchObject({
      name: 'CheapSharkError',
      status: 404,
      message: expect.stringContaining('HTTP 404'),
    });
    await expect(getDeals()).rejects.toBeInstanceOf(CheapSharkError);
  });

  it('wraps network failures in a CheapSharkError without a status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    await expect(getDeals()).rejects.toSatisfy((error: unknown): boolean => (
      error instanceof CheapSharkError && error.status === undefined
    ));
  });

  it('rejects malformed payload shapes', async () => {
    mockFetchOnce({ unexpected: true });

    await expect(getDeals()).rejects.toThrow(/payload shape/i);
  });

  it('propagates abort signals to fetch', async () => {
    const fetchMock = mockFetchOnce([]);
    const controller = new AbortController();

    await getDeals({ title: 'portal' }, controller.signal);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});

describe('searchGames', () => {
  it('encodes the title and limit and returns results', async () => {
    const fetchMock = mockFetchOnce([game]);

    const games = await searchGames('dota 2', 3);

    expect(games).toHaveLength(1);
    expect(games[0]!.cheapest).toBe(9.99);
    expect(games[0]!.external).toBe('Dota 2');

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('/games?title=dota+2&limit=3');
  });

  it('returns [] without calling the API for blank titles', async () => {
    const fetchMock = mockFetchOnce([]);

    expect(await searchGames('   ')).toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getStores', () => {
  it('returns the store list from /stores', async () => {
    mockFetchOnce([store]);

    const stores = await getStores();

    expect(stores).toHaveLength(1);
    expect(stores[0]!.storeName).toBe('Steam');
  });
});
