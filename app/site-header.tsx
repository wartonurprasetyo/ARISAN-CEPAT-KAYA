export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="/"><span className="brand-mark">W</span><span>WAR Arisan</span></a>
      <nav className="nav" aria-label="Navigasi utama"><a href="/">WAR resmi</a><a href="/riwayat">Riwayat</a><a href="/test">Mode test</a><a href="/admin">Admin</a></nav>
    </header>
  );
}
