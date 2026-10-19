import type { JsonLdNode } from '@/views/site/structured-data';

/**
 * One `<script type="application/ld+json">` (views/site/structured-data.ts builds the node).
 * Rendered from the page component, the place node_modules/next/dist/docs/01-app/02-guides/json-ld.md
 * recommends; plain JSX, so the Next and vinext builds print it alike.
 *
 * Every `<` is written as `<`. The node carries free text a coach or MaxPreps wrote (a venue
 * name), and a literal `</script>` in it would end the tag and put the rest of the string
 * into the page as markup. JSON parsers read `<` back as `<`, so the data is unchanged.
 */
export default function JsonLd({ data }: { data: JsonLdNode }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
