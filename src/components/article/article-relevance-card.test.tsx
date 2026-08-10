import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticleRelevanceCard } from './article-relevance-card'

describe('ArticleRelevanceCard', () => {
  it('shows score and reason', () => {
    render(<ArticleRelevanceCard score={84} reason="Matches your interest in local climate policy." />)
    expect(screen.getByText('Relevance 84/100')).toBeTruthy()
    expect(screen.getByText('Matches your interest in local climate policy.')).toBeTruthy()
  })

  it('keeps signal explanations behind an expandable detail', () => {
    render(<ArticleRelevanceCard score={84} reason="Useful context." signals={{ evidence_credibility: { value: 90, reason: 'Cites primary sources.' } }} />)
    expect(screen.getByText('Why this score')).toBeTruthy()
    expect(screen.getByText('Evidence & credibility')).toBeTruthy()
    expect(screen.getByText('Cites primary sources.')).toBeTruthy()
  })
})
