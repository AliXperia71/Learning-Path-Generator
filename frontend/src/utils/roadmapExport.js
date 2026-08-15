// Client-side roadmap exports — Markdown file download + print-to-PDF window.

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

const fileSlug = (title) =>
  (title || 'learning-roadmap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function buildRoadmapMarkdown(data, { level, hoursPerDay }) {
  const lines = [
    `# ${data.title || 'Learning Roadmap'}`,
    '',
    `**Level:** ${level} · **Commitment:** ${hoursPerDay} hrs/day · **Duration:** ${data.calculated_total_weeks} weeks`,
    '',
  ];

  (data.weeks || []).forEach((wk, i) => {
    lines.push(`## Week ${wk.week_number || i + 1}: ${wk.focus || ''}`, '');
    if (wk.topics?.length) lines.push(`**Topics:** ${wk.topics.join(', ')}`, '');
    if (wk.live_resources?.length) {
      lines.push('**Resources:**');
      wk.live_resources.forEach((r) => lines.push(`- [${r.title}](${r.url})`));
      lines.push('');
    }
    if (wk.practice?.length) {
      lines.push('**Practice:**');
      wk.practice.forEach((p) => lines.push(`- ${p}`));
      lines.push('');
    }
    if (wk.mini_exercise) lines.push(`**Milestone assignment:** ${wk.mini_exercise}`, '');
  });

  if (data.learning_outcomes?.length) {
    lines.push('## Learning Outcomes', '');
    data.learning_outcomes.forEach((o) => lines.push(`- ${o}`));
    lines.push('');
  }
  return lines.join('\n');
}

export function downloadRoadmapMarkdown(data, meta) {
  const blob = new Blob([buildRoadmapMarkdown(data, meta)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileSlug(data.title)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildPrintableHtml(data, { level, hoursPerDay }) {
  const weeksHtml = (data.weeks || [])
    .map((wk, i) => `
      <section class="week">
        <h2><span class="wk">Week ${escapeHtml(wk.week_number || i + 1)}</span> ${escapeHtml(wk.focus)}</h2>
        ${wk.topics?.length ? `<p class="topics">${wk.topics.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</p>` : ''}
        ${wk.live_resources?.length ? `<h3>Resources</h3><ul>${wk.live_resources.map((r) => `<li><a href="${escapeHtml(r.url)}">${escapeHtml(r.title)}</a></li>`).join('')}</ul>` : ''}
        ${wk.practice?.length ? `<h3>Practice</h3><ul>${wk.practice.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
        ${wk.mini_exercise ? `<p class="exercise"><strong>Milestone assignment:</strong> ${escapeHtml(wk.mini_exercise)}</p>` : ''}
      </section>`)
    .join('');

  const outcomesHtml = data.learning_outcomes?.length
    ? `<section class="week"><h2>Learning Outcomes</h2><ul>${data.learning_outcomes.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul></section>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.title || 'Learning Roadmap')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&display=swap" rel="stylesheet" />
<style>
  /* CourseForge brand palette — forge navy #0B1B2B, ember #FF8900. Kept in sync
     with src/index.css by hand: this document is printed in a detached window,
     so it can't read the app's stylesheet. Headings fall back gracefully if the
     webfont doesn't load before the print dialog opens. */
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0B1B2B; margin: 40px auto; max-width: 720px; line-height: 1.55; }
  h1, h2 { font-family: "Chakra Petch", -apple-system, BlinkMacSystemFont, sans-serif; }
  header { border-bottom: 2px solid #0B1B2B; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .meta { font-size: 12px; color: #3A4C5E; }
  .week { margin-bottom: 22px; break-inside: avoid; }
  h2 { font-size: 15px; margin: 0 0 6px; }
  .wk { background: #0B1B2B; color: #fff; border-radius: 6px; padding: 2px 8px; font-size: 11px; margin-right: 6px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64788C; margin: 10px 0 4px; }
  ul { margin: 4px 0; padding-left: 20px; font-size: 12.5px; }
  a { color: #AB5C00; text-decoration: none; }
  .topics span { display: inline-block; background: #F4F6F8; border: 1px solid #E2E8EE; border-radius: 6px; padding: 1px 8px; font-size: 11px; margin: 2px 4px 2px 0; }
  .exercise { font-size: 12.5px; background: #FFF3E6; border: 1px solid #FBE6CD; border-radius: 8px; padding: 8px 12px; }
  @media print { body { margin: 0.4in; } }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(data.title || 'Learning Roadmap')}</h1>
  <p class="meta">Level: ${escapeHtml(level)} &nbsp;·&nbsp; Commitment: ${escapeHtml(hoursPerDay)} hrs/day &nbsp;·&nbsp; Duration: ${escapeHtml(data.calculated_total_weeks)} weeks &nbsp;·&nbsp; Generated by CourseForge</p>
</header>
${weeksHtml}
${outcomesHtml}
<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body>
</html>`;
}

export function printRoadmapPdf(data, meta) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow pop-ups for this site to save the roadmap as a PDF.');
    return;
  }
  win.document.write(buildPrintableHtml(data, meta));
  win.document.close();
}
