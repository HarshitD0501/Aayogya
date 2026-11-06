import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-ui-canvas text-ui-text flex flex-col items-center justify-center p-6 text-center font-sans focus:outline-none"
    >
      <div className="max-w-md w-full bg-ui-surface border border-ui-border-decorative rounded-xl shadow-ui-card p-8 space-y-4">
        <span className="text-4xl" role="img" aria-label="Search icon">🔍</span>
        <h1 className="font-serif font-semibold text-2xl text-ui-text">
          Page Not Found
        </h1>
        <p className="font-sans text-sm text-ui-text-secondary leading-relaxed">
          The requested healthcare portal page or resource could not be found.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[44px] mt-2 px-6 py-2.5 bg-ui-blue hover:bg-ui-blue-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2"
        >
          Return to Home
        </Link>
      </div>
    </main>
  );
}
