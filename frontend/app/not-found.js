import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-brand-cream text-brand-navy flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-brand-white border-2 border-brand-navy sketchy-box shadow-sketch p-8 space-y-4">
        <span className="text-4xl" role="img" aria-label="Search icon">🔍</span>
        <h1 className="font-serif font-black text-2xl text-brand-navy">
          Page Not Found
        </h1>
        <p className="font-sans text-xs text-brand-gray leading-relaxed">
          The requested healthcare portal page or resource could not be found.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 px-6 py-2.5 bg-brand-navy text-brand-cream border-2 border-brand-navy font-serif font-bold text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
        >
          Return to Home
        </Link>
      </div>
    </main>
  );
}
