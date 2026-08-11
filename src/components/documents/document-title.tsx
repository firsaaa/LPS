/** Standard document numbering convention: code prefixes the title on one line, e.g. "LGM-INI-KTR-001 Kontrak Kerja Tower A". */
export function DocumentTitle({ code, title, className }: { code?: string | null; title: string; className?: string }) {
  return (
    <span className={className}>
      {code && <span className="font-mono text-blue-600 mr-1.5">{code}</span>}
      {title}
    </span>
  );
}
