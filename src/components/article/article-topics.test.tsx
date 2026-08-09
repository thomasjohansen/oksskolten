import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticleTopics } from './article-topics'

describe('ArticleTopics', () => {
  it('renders discovered topics as compact article metadata', () => {
    render(<ArticleTopics topics={['Climate policy', 'Renewable energy']} />)
    expect(screen.getByRole('list', { name: 'Article topics' })).toBeTruthy()
    expect(screen.getByText('Climate policy')).toBeTruthy()
    expect(screen.getByText('Renewable energy')).toBeTruthy()
  })

  it('renders nothing when topics are not available', () => {
    const { container } = render(<ArticleTopics topics={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
