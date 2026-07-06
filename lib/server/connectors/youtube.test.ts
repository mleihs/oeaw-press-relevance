import { describe, it, expect } from 'vitest';
import {
  parseYoutubeVideoId,
  parseIsoDuration,
  youtubeVideoUrl,
  parseChannelFeed,
} from './youtube';

describe('parseYoutubeVideoId', () => {
  const id = 'dQw4w9WgXcQ';

  it.each([
    [`https://www.youtube.com/watch?v=${id}`],
    [`https://www.youtube.com/watch?v=${id}&t=42s`],
    [`https://m.youtube.com/watch?v=${id}`],
    [`https://music.youtube.com/watch?v=${id}`],
    [`https://youtu.be/${id}`],
    [`https://youtu.be/${id}?si=abc123`],
    [`https://www.youtube.com/shorts/${id}`],
    [`https://www.youtube.com/embed/${id}`],
    [`https://www.youtube.com/live/${id}`],
    [`https://www.youtube.com/v/${id}`],
    [`https://www.youtube-nocookie.com/embed/${id}`],
    [`http://youtube.com/watch?v=${id}`],
    [`  https://youtu.be/${id}  `],
    [id], // nackte ID
  ])('erkennt %s', (input) => {
    expect(parseYoutubeVideoId(input)).toBe(id);
  });

  it.each([
    ['https://vimeo.com/12345'],
    ['https://www.youtube.com/@oeaw'], // Kanal-Handle, kein Video
    ['https://www.youtube.com/watch'], // watch ohne v
    ['https://www.youtube.com/watch?v=tooshort'],
    ['https://evil.example/watch?v=dQw4w9WgXcQ'], // fremder Host
    ['ftp://youtu.be/dQw4w9WgXcQ'],
    ['kein link'],
    [''],
  ])('lehnt %s ab', (input) => {
    expect(parseYoutubeVideoId(input)).toBeNull();
  });
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT4M13S', 4 * 60 + 13],
    ['PT1H2M3S', 3723],
    ['PT58S', 58],
    ['PT2H', 7200],
    ['PT15M', 900],
    ['P1DT2H', 86400 + 7200],
  ])('%s -> %d s', (iso, expected) => {
    expect(parseIsoDuration(iso)).toBe(expected);
  });

  it('lehnt Unparsebares ab', () => {
    expect(parseIsoDuration('')).toBeNull();
    expect(parseIsoDuration('PT')).toBeNull();
    expect(parseIsoDuration('4:13')).toBeNull();
  });
});

describe('youtubeVideoUrl', () => {
  it('baut die kanonische watch-URL', () => {
    expect(youtubeVideoUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('parseChannelFeed', () => {
  // Verkürztes echtes Atom-Feed-Fragment (feeds/videos.xml). Der Feed-Kopf
  // trägt einen eigenen <title>, der nicht als Video zählen darf.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Österreichische Akademie der Wissenschaften</title>
 <entry>
  <id>yt:video:xIuDUFFJXws</id>
  <yt:videoId>xIuDUFFJXws</yt:videoId>
  <title>„Exile &amp; Excellence“ – Zeilinger</title>
  <published>2026-06-30T15:35:59+00:00</published>
  <media:group>
   <media:title>„Exile &amp; Excellence“ – Zeilinger</media:title>
   <media:thumbnail url="https://i1.ytimg.com/vi/xIuDUFFJXws/hqdefault.jpg" width="480" height="360"/>
  </media:group>
 </entry>
 <entry>
  <yt:videoId>FCuh5Pke_RM</yt:videoId>
  <title>War die Steinzeit primitiver als heute?</title>
  <published>2026-06-20T08:00:00+00:00</published>
 </entry>
</feed>`;

  it('extrahiert Videos mit ID/Titel/Datum/Thumbnail und decodiert Entities', () => {
    const videos = parseChannelFeed(xml);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toEqual({
      video_id: 'xIuDUFFJXws',
      title: '„Exile & Excellence“ – Zeilinger',
      published_at: '2026-06-30T15:35:59+00:00',
      thumbnail_url: 'https://i1.ytimg.com/vi/xIuDUFFJXws/hqdefault.jpg',
    });
    expect(videos[1].thumbnail_url).toBeNull();
  });

  it('leerer/fremder Input -> leere Liste', () => {
    expect(parseChannelFeed('')).toEqual([]);
    expect(parseChannelFeed('<html>not a feed</html>')).toEqual([]);
  });
});
