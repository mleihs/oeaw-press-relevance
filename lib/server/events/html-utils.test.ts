import { describe, it, expect } from 'vitest';
import { sanitizeEventInformation } from './html-utils';

// `stripHtmlToText` was consolidated into `decodeHtmlBlock`
// (lib/shared/html-utils.ts) — see that module's test file for its
// coverage. This file keeps only the sanitize path because
// `sanitize-html` stays server-only.

describe('sanitizeEventInformation — XSS hardening', () => {
  it('strips <script> entirely (content included)', () => {
    const out = sanitizeEventInformation(
      '<p>safe</p><script>alert(1)</script><p>more</p>',
    );
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toContain('safe');
    expect(out).toContain('more');
  });

  it('strips <iframe>, <object>, <embed>, <style>', () => {
    for (const tag of ['iframe', 'object', 'embed', 'style']) {
      const out = sanitizeEventInformation(
        `<p>x</p><${tag}>evil</${tag}><p>y</p>`,
      );
      expect(out).not.toContain(`<${tag}`);
      // sanitize-html drops content of script/style; iframe/object/embed text
      // content gets dropped too. Just ensure no tag remains.
    }
  });

  it('strips inline event handlers (onclick, onload, onerror, ...)', () => {
    const out = sanitizeEventInformation(
      '<p onclick="alert(1)">x</p><a href="https://example.org" onmouseover="alert(2)">link</a>',
    );
    expect(out).not.toMatch(/onclick=/i);
    expect(out).not.toMatch(/onmouseover=/i);
    expect(out).toContain('<p>');
    expect(out).toContain('href="https://example.org"');
  });

  it('drops javascript:, data:, vbscript: hrefs', () => {
    const out1 = sanitizeEventInformation(
      '<a href="javascript:alert(1)">x</a>',
    );
    expect(out1).not.toContain('javascript:');
    const out2 = sanitizeEventInformation(
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    );
    expect(out2).not.toContain('data:');
    const out3 = sanitizeEventInformation('<a href="vbscript:msgbox">x</a>');
    expect(out3).not.toContain('vbscript:');
  });

  it('keeps https/http/mailto/tel hrefs', () => {
    expect(
      sanitizeEventInformation('<a href="https://oeaw.ac.at/x">x</a>'),
    ).toContain('href="https://oeaw.ac.at/x"');
    expect(
      sanitizeEventInformation('<a href="http://oeaw.ac.at/x">x</a>'),
    ).toContain('href="http://oeaw.ac.at/x"');
    expect(sanitizeEventInformation('<a href="mailto:a@b.c">x</a>')).toContain(
      'href="mailto:a@b.c"',
    );
    expect(sanitizeEventInformation('<a href="tel:+431234567">x</a>')).toContain(
      'href="tel:+431234567"',
    );
  });

  it('drops TYPO3 t3:// link shells (no href = drop whole <a>)', () => {
    const out = sanitizeEventInformation(
      '<p>before</p><a class="btn" href="t3://file?uid=42">Programm</a><p>after</p>',
    );
    expect(out).not.toContain('t3:');
    expect(out).not.toMatch(/<a[^>]*Programm/);
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('forces target=_blank rel=noopener on every <a>', () => {
    const out = sanitizeEventInformation(
      '<a href="https://example.org/x">link</a>',
    );
    expect(out).toMatch(/target="_blank"/);
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  it('preserves the allow-listed tags: p, br, h3-h6, ul, ol, li, strong, em, b, i, span, a', () => {
    const html =
      '<h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>' +
      '<p>P<br/>break</p>' +
      '<ul><li>U-li</li></ul><ol><li>O-li</li></ol>' +
      '<strong>S</strong><em>E</em><b>B</b><i>I</i><span>SP</span>' +
      '<a href="https://x">A</a>';
    const out = sanitizeEventInformation(html);
    for (const tag of [
      '<h3>', '<h4>', '<h5>', '<h6>',
      '<p>', '<br', '<ul>', '<li>', '<ol>',
      '<strong>', '<em>', '<b>', '<i>', '<span>', '<a ',
    ]) {
      expect(out, `expected ${tag} to survive`).toContain(tag);
    }
  });

  it('strips disallowed tags but preserves their inner text', () => {
    // sanitize-html default: disallowed tag → drop tag, keep text content.
    const out = sanitizeEventInformation(
      '<div>visible</div><table><tr><td>cell</td></tr></table>',
    );
    expect(out).not.toContain('<div');
    expect(out).not.toContain('<table');
    expect(out).toContain('visible');
    expect(out).toContain('cell');
  });

  it('removes data- and style attributes (not in allow-list)', () => {
    const out = sanitizeEventInformation(
      '<p data-foo="bar" style="color:red">x</p>',
    );
    expect(out).not.toMatch(/data-foo=/);
    expect(out).not.toMatch(/style=/);
  });

  it('survives empty/whitespace-only input', () => {
    expect(sanitizeEventInformation('')).toBe('');
    expect(sanitizeEventInformation('   ')).toBe('   ');
  });
});
