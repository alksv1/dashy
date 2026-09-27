export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const audioUrl = url.searchParams.get('url');

  if (!audioUrl) {
    return new Response('Missing audio url', { status: 400 });
  }

  // 转发请求到真实的 muse.ai / Meta CDN 音频地址
  const forwardHeaders = new Headers();
  // 转发 Range 请求头，确保浏览器可以拖动进度条和快进快退
  const range = request.headers.get('Range');
  if (range) {
    forwardHeaders.set('Range', range);
  }
  forwardHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    const upstreamRes = await fetch(audioUrl, {
      headers: forwardHeaders,
      redirect: 'follow',
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    responseHeaders.set('Content-Type', upstreamRes.headers.get('Content-Type') || 'audio/mpeg');
    responseHeaders.set('Accept-Ranges', 'bytes');

    if (upstreamRes.headers.get('Content-Range')) {
      responseHeaders.set('Content-Range', upstreamRes.headers.get('Content-Range'));
    }
    if (upstreamRes.headers.get('Content-Length')) {
      responseHeaders.set('Content-Length', upstreamRes.headers.get('Content-Length'));
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response('Error proxying audio stream', { status: 502 });
  }
}
