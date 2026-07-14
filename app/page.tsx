import Link from 'next/link'

const FEATURES = [
  {
    title: 'Folder-based file org',
    description: 'Define any folders — Main, Transparent, Color A — and assign your files. Folder structure flows into the ZIP automatically.',
  },
  {
    title: 'One-click ZIP download',
    description: 'Click Download and get a perfectly structured ZIP: folders, README, Thank You card, and How-To image — ready to upload.',
  },
  {
    title: 'Etsy description generator',
    description: 'Fill in your product details once. Hit Refresh and get a complete Etsy description with license terms, file list, and contact info.',
  },
  {
    title: '13-tag Etsy SEO',
    description: 'A tag chip editor with a count badge and one-click "Suggest" to fill in generic digital product tags. Never leave tags empty.',
  },
  {
    title: 'Etsy listing image slots',
    description: '6 dedicated image slots for your Etsy listing — hero, previews, detail shots, branding. Drag-drop upload, stored per product.',
  },
  {
    title: 'Auto-generated README',
    description: 'Every ZIP includes a professional README.txt with your license terms, folder breakdown, contact info, and usage instructions.',
  },
]

const STEPS = [
  { n: '01', title: 'Create a product', body: 'Give it a name, SKU, Etsy title, price, and license type. Stays saved on your machine.' },
  { n: '02', title: 'Define folders + upload files', body: 'Create folder labels that match your product structure. Drag-drop your files and assign them to folders.' },
  { n: '03', title: 'Generate listing content', body: 'Hit Refresh on the Etsy description. Add your 13 tags. Upload your listing images. Preview the README.' },
  { n: '04', title: 'Download ZIP → list on Etsy', body: 'One click downloads a ready-to-upload ZIP. Copy your title, description, and tags. Paste into Etsy. Done.' },
]

const PAINS = [
  'Write a unique description for every single product',
  'Manually organize files into folders before zipping',
  'Research 13 SEO tags per listing from scratch',
  'Write a README for customers explaining how to use the files',
  'Hunt for your hero image, how-to graphic, and thank-you card every time',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">

      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight">MossarellaStudio — Product Factory</span>
          <div className="flex items-center gap-3">
            <Link href="/app" className="border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:border-violet-500 hover:text-zinc-100 transition-colors">
              Open App
            </Link>
            <Link href="/api/buy" className="border border-violet-600 bg-violet-600 px-4 py-2 text-sm text-zinc-100 hover:bg-violet-500 transition-colors">
              Buy Pro — $29
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b border-zinc-800 px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-zinc-600 mb-4">For digital product sellers on Etsy</p>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6 text-zinc-100">
            Pack your files.<br />
            Generate your listing.<br />
            <span className="text-violet-400">Ship on Etsy.</span>
          </h1>
          <p className="text-zinc-400 text-lg mb-10 max-w-2xl leading-relaxed">
            Product Factory automates the tedious parts of listing digital products — README generation, Etsy description copy, ZIP structure, and tag research. All in one local tool.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/app" className="border border-violet-600 bg-violet-600 px-6 py-3 text-sm text-zinc-100 hover:bg-violet-500 transition-colors">
              Open App — it&apos;s free →
            </Link>
            <Link href="#how-it-works" className="border border-zinc-700 px-6 py-3 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors">
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-zinc-800 px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-zinc-600 mb-3">The problem</p>
          <h2 className="text-2xl font-bold mb-8 text-zinc-100">Listing on Etsy is a grind.</h2>
          <p className="text-zinc-400 mb-8">Every time you release a new digital product, you have to:</p>
          <ul className="space-y-3">
            {PAINS.map((pain) => (
              <li key={pain} className="flex items-start gap-3 text-zinc-400">
                <span className="text-red-400 mt-0.5 shrink-0">✗</span>
                <span>{pain}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-zinc-300">Product Factory handles all of it — so you can focus on making things.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-b border-zinc-800 px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-zinc-600 mb-3">How it works</p>
          <h2 className="text-2xl font-bold mb-12 text-zinc-100">Four steps from files to listed.</h2>
          <div className="space-y-8">
            {STEPS.map((step) => (
              <div key={step.n} className="flex gap-6">
                <div className="shrink-0 w-12 h-12 border border-zinc-700 bg-zinc-900 flex items-center justify-center text-lg font-bold text-violet-400">
                  {step.n}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-100 mb-1">{step.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-zinc-800 px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-zinc-600 mb-3">Features</p>
          <h2 className="text-2xl font-bold mb-12 text-zinc-100">Everything in the box.</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="border border-zinc-800 bg-zinc-900 p-5">
                <h3 className="font-bold text-zinc-100 mb-2 text-sm">{feature.title}</h3>
                <p className="text-zinc-500 text-xs leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-zinc-800 px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-zinc-600 mb-3">Pricing</p>
          <h2 className="text-2xl font-bold mb-12 text-zinc-100">Simple, one-time pricing.</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-zinc-800 bg-zinc-900 p-6">
              <p className="text-xs uppercase tracking-widest text-zinc-600 mb-2">Free</p>
              <p className="text-3xl font-bold text-zinc-100 mb-1">$0</p>
              <p className="text-zinc-500 text-sm mb-6">No credit card needed</p>
              <ul className="space-y-2 mb-8">
                {['Up to 3 products', 'Full feature access', 'Local storage only', 'ZIP download', 'Etsy listing generator'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="text-emerald-500">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/app" className="block text-center border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:border-violet-500 transition-colors">
                Get started free
              </Link>
            </div>
            <div className="border border-violet-700 bg-zinc-900 p-6 relative">
              <div className="absolute top-0 right-0 border-l border-b border-violet-700 bg-violet-900 px-3 py-1 text-xs text-violet-300">
                Recommended
              </div>
              <p className="text-xs uppercase tracking-widest text-violet-400 mb-2">Pro</p>
              <p className="text-3xl font-bold text-zinc-100 mb-1">$29</p>
              <p className="text-zinc-500 text-sm mb-6">One-time payment, lifetime access</p>
              <ul className="space-y-2 mb-8">
                {['Unlimited products', 'Full feature access', 'Local storage only', 'ZIP download', 'Etsy listing generator', 'Priority support'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                    <span className="text-violet-400">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/api/buy" className="block text-center border border-violet-600 bg-violet-600 px-4 py-2 text-sm text-zinc-100 hover:bg-violet-500 transition-colors">
                Buy Pro — $29 one-time
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-b border-zinc-800 px-6 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4 text-zinc-100">Ready to ship your next product?</h2>
          <p className="text-zinc-400 mb-8">Start for free. No account, no cloud. Your products stay on your machine.</p>
          <Link href="/app" className="inline-block border border-violet-600 bg-violet-600 px-8 py-3 text-sm text-zinc-100 hover:bg-violet-500 transition-colors">
            Open Product Factory →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-600">
          <span>MossarellaStudio — Product Factory</span>
          <span>© 2025</span>
        </div>
      </footer>

    </div>
  )
}
