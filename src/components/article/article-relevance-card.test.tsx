import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticleRelevanceCard } from './article-relevance-card'

describe('ArticleRelevanceCard', () => {
  it('shows score and reason', () => {
    render(<ArticleRelevanceCard score={84} reason="Matches your interest in local climate policy." />)
    expect(screen.getByText('Relevance 84/100')).toBeTruthy()
    expect(screen.getByText('Matches your interest in local climate policy.')).toBeTruthy()
  })

  it('keeps the explanation focused on the overall score and reason', () => {
    render(<ArticleRelevanceCard score={84} reason="Useful context." />)
    expect(screen.queryByText('Why this score')).toBeNull()
    expect(screen.queryByText('Evidence & credibility')).toBeNull()
    expect(screen.getByText('Useful context.')).toBeTruthy()
  })
})
