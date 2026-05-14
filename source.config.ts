import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkHeadingId } from 'remark-custom-heading-id';
import { remarkGlossarLinks } from './lib/mdx-plugins/remark-glossar-links';

export const docs = defineDocs({
  dir: 'content/help',
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkHeadingId, remarkGlossarLinks],
  },
});
