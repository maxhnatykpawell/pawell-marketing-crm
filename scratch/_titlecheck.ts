import { titleFromHtml, isFetchableUrl, TITLE_FETCH_LIMIT } from '../src/lib/linkTitle';

async function probe(url: string) {
  if (!isFetchableUrl(url)) { console.log('BLOCKED', url); return; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PawellCRM link preview)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'uk,en;q=0.8',
      },
    });
    let html = '';
    const decoder = new TextDecoder('utf-8');
    for await (const chunk of response.body as any) {
      html += decoder.decode(chunk, { stream: true });
      if (html.length >= TITLE_FETCH_LIMIT || /<\/title>/i.test(html)) break;
    }
    controller.abort();
    console.log(response.status, '|', response.url.slice(0, 60), '=>', JSON.stringify(titleFromHtml(html, response.url)));
  } catch (e) {
    console.log('ERR', url, (e as Error).message);
  } finally { clearTimeout(timer); }
}

for (const url of process.argv.slice(2)) await probe(url);
