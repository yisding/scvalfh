import { ImageResponse } from 'next/og';

/**
 * The `FH` monogram as a PNG, at whatever size the caller needs (DESIGN §7.1's language applied to
 * the site itself).
 *
 * One renderer for every icon route, because there are four of them at four sizes and they have to
 * be the same mark: app/icon.tsx (32px favicon), app/apple-icon.tsx (180px iOS tile) and the
 * installable manifest icons, app/icon-192/route.tsx and app/icon-512/route.tsx. Generated at build
 * from type — no bitmap asset in the repo and no third-party image request anywhere on the site.
 */
export function monogramImage(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e1116',
          color: '#f2f5f8',
          // The same optical ratio the 32px and 180px marks already use.
          fontSize: Math.round(size * 0.455),
          fontWeight: 600,
          letterSpacing: '-0.04em',
        }}
      >
        FH
      </div>
    ),
    { width: size, height: size },
  );
}
