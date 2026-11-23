// Vercel serverless function: forwards a "Hire me" enquiry to a Discord channel.
// The webhook link is kept in the DISCORD_WEBHOOK environment variable
// (Vercel -> Project -> Settings -> Environment Variables). Never put it in the website code.
const hits = new Map(); // simple per-visitor limit: 5 enquiries per minute
const cut = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

module.exports = async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const hook = process.env.DISCORD_WEBHOOK;
  if (!hook || !/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\//.test(hook)) {
    return res.status(500).json({ ok: false });
  }

  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 5) return res.status(429).json({ ok: false });
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) hits.clear();

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const f = {
    name: cut(b.name, 80), email: cut(b.email, 120), phone: cut(b.phone, 40), company: cut(b.company, 120),
    service: cut(b.service, 80), budget: cut(b.budget, 40), start: cut(b.start, 60), audience: cut(b.audience, 60),
    message: cut(b.message, 1500),
  };
  if (!f.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) || !f.message) return res.status(400).json({ ok: false });

  const field = (name, value, inline) => (value ? { name, value, inline: !!inline } : null);
  const embed = {
    title: "New Hire me enquiry",
    color: 0xe8a83a,
    description: f.message,
    fields: [
      field("Name", f.name, true), field("Email", f.email, true), field("Phone", f.phone, true),
      field("Company or website", f.company, true), field("Service", f.service, false),
      field("Budget", f.budget, true), field("Start", f.start, true), field("For", f.audience, true),
    ].filter(Boolean),
    timestamp: new Date().toISOString(),
    footer: { text: "Portfolio form" },
  };

  try {
    const r = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Portfolio", allowed_mentions: { parse: [] }, embeds: [embed] }),
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (e) {
    return res.status(502).json({ ok: false });
  }
};
