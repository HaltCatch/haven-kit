import { describe, expect, it } from 'vitest';
import { RichTextContent, readAsset, safeLink } from './content';

describe('rich text content safety', () => {
  const content = () => new RichTextContent(document);
  it('removes executable markup, attributes, styles, external images and unsafe links', () => {
    const result = content().parse(
      '<p onclick="alert(1)" style="color:red">Hello<script>alert(1)</script><a href="javascript:alert(1)">link</a><iframe src="https://evil.test"></iframe><img src="https://tracker.test/a"><svg onload="alert(1)"></svg></p>',
    );
    expect(result.state.valid).toBe(false);
    expect(result.html).toContain('Hello');
    expect(result.html).not.toMatch(/script|onclick|iframe|svg|style=|src=|javascript:/);
  });
  it('keeps semantic formats and persists only validated image references', () => {
    const value =
      '<p><strong>Hello</strong> <em>world</em><a href="https://example.test">link</a></p><img data-haven-asset-id="one" data-haven-asset-name="Image" data-haven-asset-type="image/png" data-haven-asset-size="42">';
    const result = content().parse(value);
    expect(result.state.valid).toBe(true);
    expect(result.html).toContain('<strong>Hello</strong>');
    expect(result.html).toContain('rel="noopener noreferrer"');
    expect(result.html).not.toContain('src=');
    expect(content().parse(result.html)).toEqual(result);
    const holder = document.createElement('div');
    holder.innerHTML = result.html;
    expect(readAsset(holder.querySelector('img')!)).toEqual({
      id: 'one',
      name: 'Image',
      mediaType: 'image/png',
      size: 42,
    });
  });
  it('treats markup-only content as empty without removing image-only values', () => {
    expect(content().parse('<p><br></p>').html).toBe('');
    expect(content().parse('<p>&nbsp;</p>').state.empty).toBe(true);
    expect(
      content().parse(
        '<img data-haven-asset-id="one" data-haven-asset-name="Image" data-haven-asset-type="image/png" data-haven-asset-size="42">',
      ).state.empty,
    ).toBe(false);
    expect(
      content().parse(
        '<img data-haven-asset-id="one" data-haven-asset-name="Image" data-haven-asset-type="image/svg+xml" data-haven-asset-size="42">',
      ).state.valid,
    ).toBe(false);
  });
  it('validates protocols via URL parsing rather than an http prefix', () => {
    expect(safeLink('https://example.test')).toBe(true);
    expect(safeLink('mailto:hello@example.test')).toBe(true);
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,test',
      'httpunsafe:test',
      '//example.test',
    ])
      expect(safeLink(value)).toBe(false);
  });
});
