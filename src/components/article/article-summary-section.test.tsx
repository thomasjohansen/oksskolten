import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LocaleContext } from '../../lib/i18n'
import { ArticleSummarySection } from './article-summary-section'

describe('ArticleSummarySection', () => {
  it('explains that summaries are generated automatically when absent', () => {
    render(
      <LocaleContext.Provider value={{ locale: 'en', setLocale: () => {} }}>
        <ArticleSummarySection summary={null} summarizing={false} streamingText="" summaryHtml="" streamingHtml="" summarizeError={null} metricsText={null} />
      </LocaleContext.Provider>,
    )

    expect(screen.getByText('A summary will be generated automatically after import.')).toBeTruthy()
  })
})
