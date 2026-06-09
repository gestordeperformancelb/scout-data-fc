// GET /img?id=PLAYER_ID — proxy de imagens do Sofascore
export async function onRequestGet(ctx) {
  const { request } = ctx;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type') || 'player'; // player | team

  if (!id) return new Response('missing id', { status: 400 });

  const imgUrl = type === 'team'
    ? `https://api.sofascore.app/api/v1/team/${id}/image`
    : `https://api.sofascore.app/api/v1/player/${id}/image`;

  try {
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScoutDataFC/1.0)',
        'Referer': 'https://www.sofascore.com/',
      },
    });

    if (!res.ok) {
      return new Response(null, { status: 404 });
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
