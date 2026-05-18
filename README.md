# MossarellaStudio — Product Factory

A local tool for packaging PNGTuber mascot products for Etsy. Manages expression files, generates README.txt, packages everything into a ZIP, and preps Etsy listing images.

---

## Running the App

```bash
npm start
```

Then open `http://localhost:1234` in your browser. The server must be running — it handles file storage and product data.

---

## Folder Structure

```
product-factory/
├── assets/                  # Shared across all products (tracked in git)
│   ├── logo.png             # Your shop logo — shows in the app header
│   ├── thank-you-image/     # Drop your THANKYOU.png here
│   ├── how-to-use/          # Drop your HOW-TO image here
│   ├── etsy-hero/           # Default placeholder for Etsy hero slot
│   ├── etsy-expressions/    # Default placeholder for expressions slot
│   ├── etsy-files/          # ...and so on for each Etsy slot
│   ├── etsy-preview/
│   ├── etsy-detail/
│   └── etsy-branding/       # Drop your branding/thank-you card here
│
├── products/                # Your product catalog — NOT tracked in git
│   └── BunnyMascot/
│       ├── product.json     # Product config + file manifest
│       ├── mascot-files/    # Uploaded PNG files (referenced by manifest)
│       ├── etsy-files/      # Uploaded Etsy listing images
│       └── assets/
│           └── etsy-*/      # Per-product Etsy slot overrides
│
├── templates/
│   ├── readme.txt           # README template (edit this to change README output)
│   └── etsy.txt             # Etsy description template
│
├── config.js                # Shop-wide settings — edit once
├── index.html               # The entire app (HTML + JS, no build step)
├── server.js                # Local Node.js server (no npm dependencies)
└── package.json
```

---

## Configuration

### `config.js` — Shop settings

Edit this once. Values auto-fill across all products.

```js
const CONFIG = {
  shopName:    "MossarellaStudio",
  contact:     "etsy.com/shop/MossarellaStudio",
  description: "A handcrafted PNGTuber mascot...",
  compatibility: ["Veadotube", "PNGTuber+", "OBS (as browser source)"],
  readmeFooter: "Personal and commercial use allowed with credit.",
  etsyTags:    "pngtuber, vtuber, mascot, ...",

  // Permanent fixed assets — appear in every product's ZIP
  extraFixedAssets: [
    // { id: 'license', label: 'License', slot: 'license', zipName: 'LICENSE.txt' },
  ],
};
```

To add a permanent fixed asset (e.g. a license file):
1. Uncomment/add an entry in `extraFixedAssets`
2. Create the folder `assets/license/`
3. Drop the file in that folder
4. It will auto-load in the Fixed Assets section every session

### `templates/readme.txt` and `templates/etsy.txt`

Plain text files with `{{placeholder}}` variables. Edit freely — the output updates when you click Refresh in the app.

Available placeholders:
| Placeholder | Value |
|---|---|
| `{{name}}` | Product name |
| `{{shopName}}` | From config.js |
| `{{contact}}` | From config.js or product field |
| `{{description}}` | Product description |
| `{{states}}` | Expression states list |
| `{{props}}` | Props/extras list |
| `{{compatibility}}` | From config.js |
| `{{notes}}` | Extra README notes |
| `{{etsyTags}}` | From config.js |

---

## Workflow

### Creating a product

1. Click **+ New** next to the product dropdown
2. Type a name → **Create**
3. Fill in Product Info, add Expression States, upload mascot PNGs
4. Assign each file a State + Expression (EOMO / EOMC / ECMO / ECMC)
5. For props with multiple frames (e.g. Cigarette open/closed): set Prop Name = `Cigarette`, Frame = `1` / `2`
6. Pick or drag Etsy listing images into the 6 slots
7. Click **Save product**

### ZIP structure output

```
BunnyMascotPack.zip
├── Artwork/
│   ├── Neutral/
│   │   ├── BunnyMascot_Neutral_EOMO.png
│   │   ├── BunnyMascot_Neutral_EOMC.png
│   │   └── ...
│   ├── Happy/
│   │   └── ...
│   └── Extras/
│       ├── BunnyMascot_Coffee.png          ← single-frame prop
│       └── Cigarette/
│           ├── BunnyMascot_Cigarette_1.png  ← multi-frame prop
│           └── BunnyMascot_Cigarette_2.png
├── README.txt
├── THANKYOU.png
└── HOWTO.png
```

### Etsy listing images

Each Etsy slot maps to a folder. There are two tiers:

| Priority | Location | When used |
|---|---|---|
| 1st | `products/Name/assets/etsy-hero/` | Product-specific image |
| 2nd | `assets/etsy-hero/` | Global placeholder (shared) |

Drop a file via the app (Pick/drag) → it uploads to the per-product folder automatically. To set a global placeholder that shows on every new product, drop the file into `assets/etsy-*/` directly.

---

## Product Catalog & Git

Products are **gitignored by default** — they live only on the machine where you made them. The code and shared assets are tracked.

```bash
# Back up / sync your products to git
npm run push-products

# Restore products on another machine after cloning
npm run pull-products
```

If you always want products tracked (no opt-in), remove `products/` from `.gitignore`.

---

## Modifying the App

| What | Where |
|---|---|
| Change shop name, tags, compatibility | `config.js` |
| Change README output format | `templates/readme.txt` |
| Change Etsy description format | `templates/etsy.txt` |
| Add a permanent fixed asset (license, etc.) | `config.js` → `extraFixedAssets` + `assets/<slot>/` |
| Change default Etsy placeholder images | Drop files in `assets/etsy-*/` |
| Change port | `server.js` line 5: `const PORT = 1234` |
| Add new API endpoints | `server.js` — follow the existing route pattern |
| Change UI / add sections | `index.html` — all HTML + JS is inline, no build step |

---

## Expression Key

| Code | Meaning |
|---|---|
| EOMO | Eyes Open, Mouth Open |
| EOMC | Eyes Open, Mouth Closed |
| ECMO | Eyes Closed, Mouth Open |
| ECMC | Eyes Closed, Mouth Closed |
