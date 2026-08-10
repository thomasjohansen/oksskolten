import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ArticleLabels } from './article-labels'

describe('ArticleLabels', () => {
  it('renders effective labels as clickable label routes', () => {
    render(<MemoryRouter><ArticleLabels labels={[{ id: 7, name: 'Climate', origin: 'ai', ai_confidence: 0.9 }]} /></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Climate' })
    expect(link.getAttribute('href')).toBe('/labels/7')
  })
})
