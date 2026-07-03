import { describe, it, expect } from 'vitest';
import { renderCardMarkdown } from './markdown';

describe('renderCardMarkdown', () => {
  it('renders basic markdown formatting', () => {
    const html = renderCardMarkdown('**bold** and *italic* and `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders lists', () => {
    const html = renderCardMarkdown('- one\n- two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('forces target/rel on links', () => {
    const html = renderCardMarkdown('[ÖAW](https://oeaw.ac.at)');
    expect(html).toContain('href="https://oeaw.ac.at"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('downgrades h1/h2 to h3 (no page-level headings in card text)', () => {
    const html = renderCardMarkdown('# Title\n## Sub');
    expect(html).not.toMatch(/<h1|<h2/);
    expect(html).toContain('<h3>Title</h3>');
    expect(html).toContain('<h3>Sub</h3>');
  });

  it('empty / whitespace input yields empty string', () => {
    expect(renderCardMarkdown('')).toBe('');
    expect(renderCardMarkdown('   \n  ')).toBe('');
    expect(renderCardMarkdown(null)).toBe('');
    expect(renderCardMarkdown(undefined)).toBe('');
  });

  // --- XSS: the whole reason this pipeline exists -------------------------

  it('strips raw <script> tags passed through markdown', () => {
    const html = renderCardMarkdown('hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips inline event handlers on raw HTML', () => {
    const html = renderCardMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
  });

  it('drops javascript: link schemes (no dead <a> shell)', () => {
    const html = renderCardMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
  });

  it('drops data: URIs in links', () => {
    const html = renderCardMarkdown('[x](data:text/html,<script>alert(1)</script>)');
    expect(html).not.toContain('data:');
    expect(html).not.toContain('<script');
  });

  it('strips <iframe>/<style> and other disallowed tags but keeps text', () => {
    const html = renderCardMarkdown('a <iframe src="//evil"></iframe> <style>x{}</style> b');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<style');
    expect(html).toContain('a ');
    expect(html).toContain('b');
  });
});
