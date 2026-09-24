import type { APIRoute, GetStaticPaths } from 'astro';

import { GENERAL, partnerLink, partners } from '../../../lib/partners';
import { qrPng } from '../../../lib/png';
import { encodeQr, qrSvg } from '../../../lib/qrcode';

// Every partner's QR code, and LVBT's general one, as files the partner kit
// offers for download and the flyers print: /partners/qr/<slug>.png (1024
// pixels square) and /partners/qr/<slug>.svg, each opening the partner's
// giveaway link exactly.

export const getStaticPaths = (() =>
  [GENERAL, ...partners.map((partner) => partner.slug)].flatMap((slug) =>
    (['png', 'svg'] as const).map((kind) => ({
      params: { file: `${slug}.${kind}` },
      props: { slug, kind },
    })),
  )) satisfies GetStaticPaths;

interface Props {
  slug: string;
  kind: 'png' | 'svg';
}

export const GET: APIRoute<Props> = ({ props }) => {
  const link = partnerLink(props.slug);
  const qr = encodeQr(link);
  if (props.kind === 'png') {
    return new Response(qrPng(qr), { headers: { 'Content-Type': 'image/png' } });
  }
  const title = `QR code for ${link.replace(/^https:\/\//, '')}`;
  return new Response(qrSvg(qr, title), { headers: { 'Content-Type': 'image/svg+xml' } });
};
