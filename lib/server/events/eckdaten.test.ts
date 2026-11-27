import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatEckdaten, parseEckdaten } from './eckdaten';

// Eckdaten-Format der Vienna-BioCenter-Events. Fixture: der wwwt1-Export vom
// 2026-11-27 (3 GMI-Events); dazu Varianten aus dem Prod-Bestand (27.11.).

const WWWT1 = JSON.parse(
  readFileSync(path.join(__dirname, '../typo3-bridge/fixtures/wwwt1-event_news_grouped-2026-11-27.json'), 'utf8'),
) as { data: { GMI: { events: Array<{ uid: number; bodytext: string }> } } };
const body = (uid: number) => WWWT1.data.GMI.events.find((e) => e.uid === uid)!.bodytext;

describe('parseEckdaten', () => {
  it('liest das wwwt1-Beispiel, übergeht das doppelte Komma und die Sekunden', () => {
    expect(parseEckdaten(body(40267))).toEqual({
      Date: '2026-12-01',
      Time: '11:30',
      Speaker: 'Linda Odenthal-Hesse',
      Location: 'Max Perutz Labs SR 1 (6.501)',
      Type: 'SFB "Meiosis" Talk',
      Institute: 'Max-Planck-Institut für Evolutionsbiologie',
      Host: 'Irene Thiemann-Boege',
    });
    expect(parseEckdaten(body(40269))).toMatchObject({ Speaker: 'Chloe Girard', Institute: 'Universite Paris-Saclay', Host: 'Joao Matos' });
  });

  it('trennt mehrere Vortragende, macht „None" und Leeres zu null, lässt Zugangshinweise stehen', () => {
    const monday = parseEckdaten(
      ' Date: 2026-06-15, Time: 12:30:00, Speaker: KRAVVARITI Konstantina (Clausen)<br />TEUSCHL Matthias (Balzarotti/Peters), Location: IMP Lecture Hall, Type: Monday Seminar, Institute: Open only to IMP/IMBA/GMI/Max Perutz Labs, Host: None ',
    );
    expect(monday).toMatchObject({
      Speaker: 'KRAVVARITI Konstantina (Clausen); TEUSCHL Matthias (Balzarotti/Peters)',
      Institute: 'Open only to IMP/IMBA/GMI/Max Perutz Labs',
      Host: null,
    });
    const symposium = parseEckdaten('Date: 2026-06-17, Time: 09:00:00, Speaker: , Location: IMP Lecture Hall, Type: Symposium, Institute: None, Host: None');
    expect(symposium).toMatchObject({ Speaker: null, Institute: null, Host: null, Type: 'Symposium' });
  });

  it('behält Kommas innerhalb eines Werts', () => {
    expect(parseEckdaten('Date: 2027-01-01, Time: 10:00:00, Speaker: A B, Location: X, Type: Talk, Institute: University of Vienna, Department of Chemistry, Host: C')!.Institute).toBe(
      'University of Vienna, Department of Chemistry',
    );
  });

  it('erkennt Fließtext und zu wenige Angaben nicht als Eckdaten', () => {
    expect(parseEckdaten('<p>Ein Vortrag über Meiose. Date: morgen.</p>')).toBeNull();
    expect(parseEckdaten('Date: 2026-12-01, Time: 11:30:00')).toBeNull();
    expect(parseEckdaten(null)).toBeNull();
    expect(parseEckdaten('')).toBeNull();
  });

  it('formatEckdaten: eine Zeile je Angabe, fehlende als (leer)', () => {
    const e = parseEckdaten('Date: 2026-06-17, Time: 09:00:00, Speaker: , Location: IMP Lecture Hall, Type: Symposium, Institute: None, Host: None')!;
    expect(formatEckdaten(e)).toBe(
      'Date: 2026-06-17\nTime: 09:00\nSpeaker: (leer)\nLocation: IMP Lecture Hall\nType: Symposium\nInstitute: (leer)\nHost: (leer)',
    );
  });
});
