import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LocaleContext } from '../../lib/i18n'
import { ArticleCard } from './article-card'

const article = {
  id: 1, feed_id: 1, feed_name: 'News', title: 'Scored article', url: 'https://example.com/article',
  published_at: '2026-01-01T00:00:00Z', lang: 'en', summary: null, excerpt: null, og_image: null,
  seen_at: null, read_at: null, bookmarked_at: null, liked_at: null,
}

function renderCard(relevanceScore?: number | null) {
  return render(
    <LocaleContext.Provider value={{ locale: 'en', setLocale: () => {} }}>
      <MemoryRouter><ArticleCard article={article} dateMode="absolute" indicatorStyle="dot" showUnreadIndicator showThumbnails relevanceScore={relevanceScore} /></MemoryRouter>
    </LocaleContext.Provider>,
  )
}

describe('ArticleCard relevance score', () => {
  it('shows a numeric score when provided', () => {
    renderCard(87)
    expect(screen.getByLabelText('Relevance score: 87')).toBeTruthy()
  })

  it('does not show score metadata without a score', () => {
    renderCard(null)
    expect(screen.queryByLabelText(/Relevance score/)).toBeNull()
  })
})
