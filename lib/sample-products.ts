export type SampleProductDefinition = {
  name: string
  sku: string
  productName: string
  etsyTitle: string
  description: string
  notes: string
  contact: string
  price: number
  currency: string
  licenseType: 'personal' | 'commercial' | 'both'
  commercialPrice?: number
  folders: string[]
  etsyTags: string[]
}

export const SAMPLE_PRODUCTS: readonly SampleProductDefinition[] = [
  {
    name: 'Warm Minimalist Wall Art Print',
    sku: 'SAMPLE-WALL-001',
    productName: 'Warm Minimalist Wall Art Print',
    etsyTitle: 'Warm Minimalist Wall Art Print, Neutral Abstract Printable Decor',
    description: 'A calm, neutral abstract wall art set for bedrooms, living rooms, and quiet workspaces. Includes high-resolution printable files in common frame ratios so the buyer can print at home or through a local service. This is sample stock designed to demonstrate how a finished digital listing is described and packaged.',
    notes: 'Package the artwork in a clearly named Prints folder. Keep the included JPG files at 300 DPI and use the README to explain printing ratios and personal-use boundaries.',
    contact: 'Questions about this sample listing? Contact the Studio Support desk.',
    price: 8,
    currency: 'USD',
    licenseType: 'both',
    commercialPrice: 18,
    folders: ['Prints', 'README'],
    etsyTags: ['printable wall art', 'neutral home decor', 'abstract print', 'digital download', 'minimalist art', 'gallery wall', 'instant download'],
  },
  {
    name: 'Quiet Moments Coloring Book',
    sku: 'SAMPLE-COLOR-001',
    productName: 'Quiet Moments Coloring Book',
    etsyTitle: 'Quiet Moments Coloring Book, Relaxing Printable Pages for Adults',
    description: 'A gentle printable coloring book with slow-living scenes, botanical details, and generous line spacing. The sample listing demonstrates how a multi-page digital product can describe its contents, formats, and intended use without relying on physical inventory or shipping.',
    notes: 'Include the printable PDF, a US Letter version, an A4 version, and a short README with printing guidance. Do not describe this digital item as a shipped book.',
    contact: 'For questions about the digital download, contact the Studio Support desk.',
    price: 6.5,
    currency: 'USD',
    licenseType: 'personal',
    folders: ['PDF', 'Printables', 'README'],
    etsyTags: ['coloring book', 'adult coloring', 'printable pages', 'mindful activity', 'digital coloring', 'relaxation gift', 'instant download'],
  },
  {
    name: 'Sunday Reset Weekly Planner',
    sku: 'SAMPLE-PLAN-001',
    productName: 'Sunday Reset Weekly Planner',
    etsyTitle: 'Sunday Reset Weekly Planner, Printable Weekly Planner and Habit Tracker',
    description: 'A practical weekly planning set for mapping priorities, meals, errands, habits, and one small reset ritual. The sample product shows how printable and editable versions can live together in one virtual stock item with clear folder naming and a concise customer-facing description.',
    notes: 'Keep editable files separate from print-ready PDFs. Mention that digital planning files are delivered instantly and no physical planner is mailed.',
    contact: 'Planning questions can be sent to the Studio Support desk.',
    price: 7,
    currency: 'USD',
    licenseType: 'both',
    commercialPrice: 16,
    folders: ['Printable PDF', 'Editable', 'README'],
    etsyTags: ['weekly planner', 'printable planner', 'habit tracker', 'meal planner', 'digital planner', 'productivity gift', 'instant download'],
  },
  {
    name: 'Botanical Wedding Invitation Suite',
    sku: 'SAMPLE-WEDDING-001',
    productName: 'Botanical Wedding Invitation Suite',
    etsyTitle: 'Botanical Wedding Invitation Suite, Editable Greenery Wedding Template',
    description: 'A coordinated digital stationery suite with a botanical invitation, details card, RSVP card, and matching envelope liner. This sample demonstrates how a bundled product can explain each included file and set expectations for an editable digital template.',
    notes: 'Package invitation components by purpose. Add a README with the editing workflow, export instructions, and a reminder that printing and customization services are not included.',
    contact: 'Template support is available from the Studio Support desk.',
    price: 12,
    currency: 'USD',
    licenseType: 'commercial',
    folders: ['Invitation', 'Details Card', 'RSVP', 'README'],
    etsyTags: ['wedding invitation', 'editable template', 'botanical wedding', 'greenery invite', 'digital stationery', 'wedding suite', 'instant download'],
  },
  {
    name: 'Studio Launch Social Templates',
    sku: 'SAMPLE-SOCIAL-001',
    productName: 'Studio Launch Social Templates',
    etsyTitle: 'Studio Launch Social Media Templates, Small Business Content Pack',
    description: 'A launch-ready social content pack for a small creative studio, including announcement, service, testimonial, and behind-the-scenes layouts. The sample listing shows how format-specific folders and a reusable template license can be documented inside one digital product record.',
    notes: 'Keep square, portrait, and story layouts in separate folders. The README should identify editable design links and explain what the buyer may customize.',
    contact: 'Template questions can be sent to the Studio Support desk.',
    price: 15,
    currency: 'USD',
    licenseType: 'commercial',
    folders: ['Square Posts', 'Portrait Posts', 'Stories', 'README'],
    etsyTags: ['social media kit', 'small business kit', 'instagram templates', 'content planner', 'canva template', 'brand launch', 'digital download'],
  },
  {
    name: 'Little Garden Clipart Bundle',
    sku: 'SAMPLE-CLIP-001',
    productName: 'Little Garden Clipart Bundle',
    etsyTitle: 'Little Garden Clipart Bundle, Botanical PNG and SVG Digital Graphics',
    description: 'A cheerful collection of hand-drawn garden graphics including leaves, flowers, pots, labels, and tiny garden tools. This sample product demonstrates a graphics bundle with transparent PNGs, editable SVGs, a contact sheet, and straightforward license language.',
    notes: 'Use transparent backgrounds for PNG files and place SVGs in their own folder. Include a contact sheet and README so the package is understandable before the buyer opens every file.',
    contact: 'Graphics licensing questions can be sent to the Studio Support desk.',
    price: 9,
    currency: 'USD',
    licenseType: 'both',
    commercialPrice: 22,
    folders: ['PNG', 'SVG', 'Contact Sheet', 'README'],
    etsyTags: ['clipart bundle', 'botanical clipart', 'garden graphics', 'png clipart', 'svg bundle', 'scrapbook graphics', 'digital download'],
  },
]

export function sampleProductNames() {
  return SAMPLE_PRODUCTS.map((product) => product.name)
}
