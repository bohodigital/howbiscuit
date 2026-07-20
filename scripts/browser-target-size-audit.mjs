export function browserTargetSizeAudit() {
  const selectors = {
    footer: '.hb-global-footer a',
    articleToc: '.hb-article-toc a',
  };
  const groups = {};

  for (const [name, selector] of Object.entries(selectors)) {
    const targets = [...document.querySelectorAll(selector)]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent.trim(),
          href: element.getAttribute('href'),
          width: Number(rect.width.toFixed(3)),
          height: Number(rect.height.toFixed(3)),
          left: Number(rect.left.toFixed(3)),
          top: Number(rect.top.toFixed(3)),
          right: Number(rect.right.toFixed(3)),
          bottom: Number(rect.bottom.toFixed(3)),
        };
      });
    const overlaps = [];
    for (let left = 0; left < targets.length; left += 1) {
      for (let right = left + 1; right < targets.length; right += 1) {
        const x = Math.min(targets[left].right, targets[right].right) - Math.max(targets[left].left, targets[right].left);
        const y = Math.min(targets[left].bottom, targets[right].bottom) - Math.max(targets[left].top, targets[right].top);
        if (x > 0.01 && y > 0.01) overlaps.push([targets[left].text, targets[right].text]);
      }
    }
    groups[name] = {
      count: targets.length,
      minimumWidth: targets.length ? Math.min(...targets.map(({ width }) => width)) : null,
      minimumHeight: targets.length ? Math.min(...targets.map(({ height }) => height)) : null,
      undersized: targets.filter(({ width, height }) => width < 24 || height < 24),
      overlaps,
      targets,
    };
  }

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 0.5,
    groups,
  };
}
