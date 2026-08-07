import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedsSection } from './feeds-section'

const mutate = vi.fn()
const patch = vi.fn().mockResolvedValue({})

vi.mock('swr', () => ({
  default: (key: string) => ({
    data: key === '/api/feeds' ? {
      feeds: [{
        id: 1, name: 'Example', url: 'https://example.com', rss_url: 'https://example.com/feed.xml',
        rss_bridge_url: null, category_id: 2, category_name: 'Tech', last_error: null,
        error_count: 0, disabled: 0, requires_js_challenge: 0, type: 'rss', etag: null,
        last_modified: null, last_content_hash: null, next_check_at: null, check_interval: null,
        created_at: '', article_count: 4, unread_count: 2, articles_per_week: 0,
        latest_published_at: null,
      }],
    } : { categories: [{ id: 2, name: 'Tech', sort_order: 0, collapsed: 0, created_at: '' }] },
    mutate,
  }),
  useSWRConfig: () => ({ mutate }),
}))

vi.mock('../../../lib/fetcher', () => ({
  fetcher: vi.fn(),
  apiPatch: (...args: unknown[]) => patch(...args),
  apiDelete: vi.fn(),
  authHeaders: () => ({}),
}))

vi.mock('../../../lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => ({
    'settings.viewer': 'Feeds', 'settings.feedsDesc': 'Manage all your feeds',
    'settings.feedAllFeeds': 'All feeds', 'settings.feedCategory': 'Category',
    'settings.feedNoCategory': 'No category', 'settings.feedSourceUrl': 'Source URL',
    'settings.feedRssUrl': 'Feed URL', 'settings.feedBridgeUrl': 'Bridge URL',
    'settings.feedSave': 'Save', 'settings.feedEditUrls': 'Show/edit URLs',
    'feeds.rename': 'Rename', 'feeds.delete': 'Delete', 'category.rename': 'Rename',
    'category.delete': 'Delete category', 'feeds.fetch': 'Fetch articles',
    'settings.feedArticles': 'articles', 'settings.feedUnread': 'unread',
  }[key] ?? key) }),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }))
vi.mock('@/components/feed/feed-error-banner', () => ({ FeedErrorBanner: () => null }))

describe('FeedsSection', () => {
  it('groups feeds and saves edited source settings', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<FeedsSection />)

    expect(screen.getByText('Tech')).toBeTruthy()
    await user.click(screen.getByText('Tech'))
    expect(screen.getByText('Example')).toBeTruthy()
    await user.click(screen.getByTitle('Show/edit URLs'))
    const bridge = screen.getByLabelText('Bridge URL')
    await user.type(bridge, 'https://bridge.example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(patch).toHaveBeenCalledWith('/api/feeds/1', expect.objectContaining({
      rss_url: 'https://example.com/feed.xml',
      rss_bridge_url: 'https://bridge.example.com',
      category_id: 2,
    }))
  })
})
