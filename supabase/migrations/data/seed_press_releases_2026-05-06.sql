-- One-shot seed for press_release_* fields based on TYPO3-Hauptseite-news (May 2026).
-- 6 unique pubs identified by matching DOI in tx_news_domain_model_news.bodytext
-- where category IN (64 'ÖAW-Pressemeldungen', 1748 'OeAW press release').
-- DE preferred over EN when both translations exist.

UPDATE publications SET
  press_release_url   = 'https://www.oeaw.ac.at/detail/news/unsichtbares-gedicht-von-wh-auden-rekonstruiert-1',
  press_release_at    = '2023-08-04',
  press_release_lang  = 'de',
  press_release_title = '"Unsichtbares" Gedicht von W.H. Auden rekonstruiert'
WHERE id = 'c33c7d33-ae97-4108-9ea9-0bbd0be52563';

UPDATE publications SET
  press_release_url   = 'https://www.oeaw.ac.at/detail/news/quantenkommunikation-in-freier-luft-nimmt-fahrt-auf-1',
  press_release_at    = '2017-07-20',
  press_release_lang  = 'de',
  press_release_title = 'Quantenkommunikation in freier Luft nimmt Fahrt auf'
WHERE id = '31020778-ce07-41f9-8419-3c96cbb58a3f';

UPDATE publications SET
  press_release_url   = 'https://www.oeaw.ac.at/detail/news/neue-praezisionsmessung-schaerft-blick-auf-antimaterie-atome',
  press_release_at    = '2017-06-12',
  press_release_lang  = 'de',
  press_release_title = 'Neue Präzisionsmessung schärft Blick auf Antimaterie-Atome'
WHERE id = '74189330-9749-4907-8af8-6b3f90ec1430';

UPDATE publications SET
  press_release_url   = 'https://www.oeaw.ac.at/detail/news/quantenverschraenkung-ist-unverwuestlich-1',
  press_release_at    = '2017-05-09',
  press_release_lang  = 'de',
  press_release_title = 'Quantenverschränkung ist unverwüstlich'
WHERE id = '5fc20572-74c0-42c4-bc44-a54c126161c1';

UPDATE publications SET
  press_release_url   = 'https://www.oeaw.ac.at/detail/news/verwischte-zeiten-in-der-quantenwelt-1',
  press_release_at    = '2017-03-09',
  press_release_lang  = 'de',
  press_release_title = '„Verwischte Zeiten" in der Quantenwelt'
WHERE id = '81d3fd31-3557-4e61-b4a2-1273cd30aa61';

UPDATE publications SET
  press_release_url   = 'https://www.oeaw.ac.at/detail/news/quantenverschraenkung-erstmals-mittels-sternenlicht-bestaetigt',
  press_release_at    = '2017-02-07',
  press_release_lang  = 'de',
  press_release_title = 'Quantenverschränkung erstmals mittels Sternenlicht bestätigt'
WHERE id = '6de02455-3dfd-4a2f-8564-8bfaf878abf4';

SELECT id, doi, press_release_url, press_release_at FROM publications WHERE press_release_url IS NOT NULL ORDER BY press_release_at DESC;
