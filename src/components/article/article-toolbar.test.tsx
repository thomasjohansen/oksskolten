import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LocaleContext } from '../../lib/i18n'
import { ArticleToolbar } from './article-toolbar'
import { TooltipProvider } from '../ui/tooltip'

vi.mock('../chat/chat-inline', () => ({ ChatInlineTrigger: () => null }))

const article = {
  id: 1, feed_id: 2, feed_name: 'Feed', title: 'Article', url: 'https://example.com/article',
  published_at: null, lang: 'en', summary: null, excerpt: null, og_image: null,
  seen_at: null, read_at: null, bookmarked_at: null, liked_at: null,
  full_text: 'body', full_text_translated: null, translated_lang: null, images_archived_at: null,
  feed_type: 'rss' as const, imageArchivingEnabled: false,
}

describe('ArticleToolbar', () => {
  it('does not offer manual summarization', () => {
    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <ArticleToolbar
            article={article}
            chatPosition="fab"
            chatOpen={false}
            onChatToggle={vi.fn()}
            isUserLang
            hasTranslation={false}
            translating={false}
            onTranslate={vi.fn()}
            isBookmarked={false}
            isLiked={false}
            archivingImages={false}
            onToggleBookmark={vi.fn()}
            onToggleLike={vi.fn()}
            onArchiveImages={vi.fn()}
            onDelete={vi.fn()}
            />
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.queryByText('Summarize')).toBeNull()
  })
})
