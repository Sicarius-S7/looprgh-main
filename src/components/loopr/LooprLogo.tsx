/**
 * LooprLogo / LooprIcon
 * Brand assets: the full wordmark logo (with a light variant for dark mode)
 * and a standalone icon mark for compact placements.
 */
// Served directly from /public so the artwork always resolves.
const logoAsset = { url: "/loopr-logo.png" };
const iconAsset = { url: "/loopr-icon.png" };


export function LooprLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center ${className}`}>
      {/* Light mode: default logo artwork. */}
      <img
        src={logoAsset.url}
        alt="Loopr"
        className="h-8 w-auto dark:hidden"
      />
      {/* Dark mode: the wordmark's deep teal disappears on dark surfaces, so show a light version. */}
      <img
        src={logoAsset.url}
        alt=""
        aria-hidden
        className="hidden h-8 w-auto dark:block dark:[filter:brightness(0)_invert(1)]"
      />
    </span>
  );
}

export function LooprIcon({ className = "size-8" }: { className?: string }) {
  return <img src={iconAsset.url} alt="Loopr icon" className={className} />;
}
