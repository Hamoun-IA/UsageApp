const cheerio = require('cheerio');

function parseOllamaSettings(html) {
  if (typeof html !== 'string') {
    throw new Error('parseOllamaSettings expects HTML string');
  }
  const $ = cheerio.load(html);

  const findSection = (label) => {
    const labelSpan = $('span').filter((_, el) => $(el).text().trim() === label).first();
    if (!labelSpan.length) return { pct: null, resetAt: null };
    const parent = labelSpan.parent();
    const pctText = parent.find('span').filter((_, el) => /\d+% used/.test($(el).text())).first().text();
    const m = pctText.match(/(\d+(?:\.\d+)?)% used/);
    const pct = m ? parseFloat(m[1]) : null;
    const resetEl = parent.find('[data-time]').first();
    const isoTime = resetEl.attr('data-time') || null;
    const resetAt = isoTime ? new Date(isoTime).getTime() : null;
    return { pct, resetAt };
  };

  const session = findSection('Session usage');
  const weekly = findSection('Weekly usage');

  let planLevel = null;
  const planLabel = $('span').filter((_, el) => $(el).text().trim() === 'Cloud Usage').first();
  if (planLabel.length) {
    const planSpan = planLabel.parent().find('span').filter((_, el) => $(el).text().trim() !== 'Cloud Usage').first();
    if (planSpan.length) {
      const raw = planSpan.text().trim();
      planLevel = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
    }
  }

  return {
    sessionPct: session.pct,
    weeklyPct: weekly.pct,
    sessionResetAt: session.resetAt,
    weeklyResetAt: weekly.resetAt,
    planLevel,
  };
}

module.exports = { parseOllamaSettings };
