// Client-Fetch-Helfer fürs Board leben in der geteilten Client-Schicht
// (lib/client), damit sie auch aus components/** importiert werden dürfen
// (Architektur-Boundaries: components -> client erlaubt, components -> app-pages
// nicht). Die Board-eigenen Komponenten importieren weiter über '../_lib/api'.
export * from '@/lib/client/board-api';
