// Tailwind-Styling für server-gesäubertes Markdown-HTML (Kartenbeschreibung +
// Kommentare). Kein @tailwindcss/typography im Projekt — kuratierte
// Arbitrary-Variants decken genau die Tags ab, die renderCardMarkdown ausgibt
// (p, a, ul/ol/li, h3/h4, code, pre, blockquote, hr, strong/em).
export const PROSE_CLASS =
  'text-[13.5px] leading-relaxed text-foreground break-words ' +
  '[&_a]:font-medium [&_a]:text-brand [&_a]:underline ' +
  '[&_p]:my-1.5 first:[&_p]:mt-0 last:[&_p]:mb-0 ' +
  '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 ' +
  '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h4]:mt-2 [&_h4]:font-semibold ' +
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] ' +
  '[&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
  '[&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground ' +
  '[&_hr]:my-3 [&_hr]:border-border';
