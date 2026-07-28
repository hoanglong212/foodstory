import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ExternalNewsConfigurationError,
  ExternalNewsProviderError,
  buildGuardianNewsUrl,
  clearGuardianNewsCache,
  fetchGuardianNews,
  normalizeGuardianArticle,
} from '../services/guardianNewsService.js'

describe('Guardian external food news integration', () => {
  it('builds a food-only Guardian request with pagination and filters', () => {
    const url = buildGuardianNewsUrl({
      apiKey: 'test-key',
      page: 2,
      pageSize: 4,
      search: 'Vietnamese cuisine',
      category: 'Recipes',
      date: '2026-07-16',
    })

    assert.equal(url.origin, 'https://content.guardianapis.com')
    assert.equal(url.searchParams.get('section'), 'food')
    assert.equal(url.searchParams.get('page'), '2')
    assert.equal(url.searchParams.get('page-size'), '4')
    assert.match(url.searchParams.get('q'), /recipe/u)
    assert.match(url.searchParams.get('q'), /Vietnamese cuisine/u)
    assert.equal(url.searchParams.get('from-date'), '2026-07-16')
    assert.equal(url.searchParams.get('to-date'), '2026-07-16')
  })

  it('normalizes Guardian HTML fields into the FoodStory news contract', () => {
    const article = normalizeGuardianArticle({
      id: 'food/2026/jul/16/example',
      webTitle: 'Example title',
      webUrl: 'https://www.theguardian.com/food/example',
      webPublicationDate: '2026-07-16T08:30:00Z',
      fields: {
        headline: 'A <strong>seasonal</strong> recipe',
        trailText: '<p>Fresh &amp; practical cooking.</p>',
        thumbnail: 'https://media.guim.co.uk/example.jpg',
        byline: 'Example Author',
      },
      tags: [{ webTitle: 'Recipes' }],
    })

    assert.equal(article.id, 'food/2026/jul/16/example')
    assert.equal(article.title, 'A seasonal recipe')
    assert.equal(article.content, 'Fresh & practical cooking.')
    assert.equal(article.category, 'Recipes')
    assert.equal(article.published_date, '2026-07-16')
    assert.equal(article.isExternal, true)
  })

  it('fetches and maps a successful provider response', async () => {
    clearGuardianNewsCache()
    let requestedUrl = null

    const fetchImpl = async (url) => {
      requestedUrl = url
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            response: {
              status: 'ok',
              currentPage: 1,
              pages: 3,
              total: 12,
              results: [
                {
                  id: 'food/example',
                  webTitle: 'Restaurant story',
                  webUrl: 'https://www.theguardian.com/food/example',
                  webPublicationDate: '2026-07-16T08:30:00Z',
                  fields: { trailText: 'A restaurant profile.' },
                  tags: [],
                },
              ],
            },
          }
        },
      }
    }

    const result = await fetchGuardianNews({
      apiKey: 'test-key',
      fetchImpl,
      useCache: false,
      category: 'Restaurants',
    })

    assert.ok(requestedUrl instanceof URL)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].category, 'Restaurants')
    assert.equal(result.totalPages, 3)
    assert.equal(result.provider.id, 'guardian-open-platform')
  })

  it('serves identical requests from the bounded in-memory cache', async () => {
    clearGuardianNewsCache()
    let providerCalls = 0
    const fetchImpl = async () => {
      providerCalls += 1
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            response: {
              status: 'ok',
              currentPage: 1,
              pages: 1,
              total: 0,
              results: [],
            },
          }
        },
      }
    }

    const options = { apiKey: 'test-key', fetchImpl, cacheTtlMs: 60_000 }
    const first = await fetchGuardianNews(options)
    const second = await fetchGuardianNews(options)

    assert.equal(first.cached, false)
    assert.equal(second.cached, true)
    assert.equal(providerCalls, 1)
  })

  it('fails clearly when the API key is absent', async () => {
    await assert.rejects(
      () => fetchGuardianNews({ apiKey: '', useCache: false }),
      ExternalNewsConfigurationError,
    )
  })

  it('converts provider failures into a safe application error', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 429,
      async json() {
        return {}
      },
    })

    await assert.rejects(
      () => fetchGuardianNews({ apiKey: 'test-key', fetchImpl, useCache: false }),
      (error) => {
        assert.ok(error instanceof ExternalNewsProviderError)
        assert.equal(error.status, 503)
        return true
      },
    )
  })

  it('converts provider timeouts into a safe gateway timeout', async () => {
    const fetchImpl = async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })

    await assert.rejects(
      () => fetchGuardianNews({ apiKey: 'test-key', fetchImpl, useCache: false, timeoutMs: 1 }),
      (error) => {
        assert.ok(error instanceof ExternalNewsProviderError)
        assert.equal(error.status, 504)
        return true
      },
    )
  })
})
