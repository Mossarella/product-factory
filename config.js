// ── MossarellaStudio Product Factory — Config ─────────────────────────────
// Edit these values once. They auto-fill the app every time you open it.

const CONFIG = {
  shopName: "MossarellaStudio",
  contact:  "etsy.com/shop/MossarellaStudio",
  description: "A handcrafted PNGTuber mascot made with love for your stream.",

  compatibility: [
    "Veadotube",
    "PNGTuber+",
    "OBS (as browser source)",
  ],

  readmeFooter: "Personal and commercial use allowed with credit. Do not redistribute.",

  etsyTags: "pngtuber, vtuber, mascot, stream asset, veadotube, twitch overlay, png avatar, digital product",

  // ── README template ────────────────────────────────────────────────────────
  // d = { name, shopName, contact, description, compatibility, states, props, notes }
  // states = [{ label, count }], props = ["coffee", "blush", ...]
  readmeTemplate(d) {
    const line = '─'.repeat(40);
    let txt = `${d.name}\n`;
    txt += `by ${d.shopName}\n`;
    txt += `${line}\n\n`;
    if (d.description) txt += `${d.description}\n\n`;
    txt += `COMPATIBLE WITH:\n`;
    d.compatibility.forEach(c => { txt += `  - ${c}\n`; });
    txt += `\nEXPRESSION STATES:\n`;
    txt += `  EOMO = Eyes Open Mouth Open\n`;
    txt += `  EOMC = Eyes Open Mouth Closed\n`;
    txt += `  ECMO = Eyes Closed Mouth Open\n`;
    txt += `  ECMC = Eyes Closed Mouth Closed\n`;
    txt += `\nINCLUDED STATES:\n`;
    d.states.forEach(s => { txt += `  - ${s.label} (${s.count} expression${s.count !== 1 ? 's' : ''})\n`; });
    if (d.props.length) {
      txt += `\nPROPS / EXTRAS:\n`;
      d.props.forEach(p => { txt += `  - ${p}\n`; });
    }
    txt += `\nHOW TO USE:\n`;
    txt += `  1. Import PNG files into Veadotube or PNGTuber+\n`;
    txt += `  2. Assign states to the matching expression triggers\n`;
    txt += `  3. Add as browser source in OBS\n\n`;
    txt += `${line}\n`;
    txt += `Thank you for your purchase!\n`;
    txt += `Contact: ${d.contact}\n`;
    if (d.notes) txt += `\nNOTES:\n${d.notes}\n`;
    return txt;
  },

  // ── Etsy description template ──────────────────────────────────────────────
  // d = { name, contact, compatibility, states, props, etsyTags }
  // states = [{ label, count }], props = ["coffee", ...]
  etsyTemplate(d) {
    const stateLines  = d.states.map(s => `✦ ${s.label} — ${s.count} expressions`).join('\n');
    const propLine    = d.props.length ? `\n✦ Props: ${d.props.join(', ')}` : '';
    const compatLines = d.compatibility.map(c => `✦ ${c}`).join('\n');

    return `✨ ${d.name} — PNGTuber Mascot Pack

Bring your stream to life with this handcrafted PNGTuber mascot!

WHAT'S INCLUDED:
${stateLines}${propLine}

COMPATIBLE WITH:
${compatLines}

Each state includes all 4 expression variants:
EOMO | EOMC | ECMO | ECMC

FILES: High-quality PNG, transparent background, ready to import.

QUESTIONS? ${d.contact}

─────────────────────────────────
Tags: ${d.etsyTags}`;
  },
};
