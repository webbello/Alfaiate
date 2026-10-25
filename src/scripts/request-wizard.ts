// Steps the request form one question at a time. Without this script the four steps stay stacked and the form still sends (progressive enhancement).
// Words come from data attributes the server wrote in the page's language; text goes in with textContent only. Browser Back moves one step (history entries), not off the page.
const root = document.querySelector<HTMLElement>('[data-wz]');
if (root) {
  const steps = [...root.querySelectorAll<HTMLElement>('[data-wz-step]')];
  const dots = [...root.querySelectorAll<HTMLElement>('[data-wz-dot]')];
  const back = root.querySelector<HTMLButtonElement>('[data-wz-back]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-wz-next]')!;
  const send = root.querySelector<HTMLButtonElement>('[data-wz-send]')!;
  const count = root.querySelector<HTMLElement>('[data-wz-count]')!;
  const template = count.dataset.template ?? 'Step {n} of {total}';
  const word = {
    next: root.dataset.next ?? 'Next',
    skip: root.dataset.skip ?? 'Skip',
    change: root.dataset.change ?? 'change',
  };
  const summary = root.querySelector<HTMLUListElement>('[data-wz-summary]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const last = steps.length;
  let current = 0;

  root.classList.add('wz-js');

  const chosen = (step: HTMLElement) =>
    [
      ...step.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked'),
    ].some((i) => i.value !== '');

  const show = (
    index: number,
    opts: { focus?: boolean; push?: boolean } = {},
  ) => {
    current = Math.min(Math.max(index, 0), last - 1);
    steps.forEach((s, i) => (s.hidden = i !== current));
    dots.forEach((d, i) =>
      i <= current
        ? d.setAttribute('data-on', '')
        : d.removeAttribute('data-on'),
    );
    count.textContent = template
      .replace('{n}', String(current + 1))
      .replace('{total}', String(last));
    back.hidden = current === 0;
    const onLast = current === last - 1;
    next.hidden = onLast;
    send.hidden = !onLast;
    next.textContent =
      chosen(steps[current]!) || current === 1 || current === 2
        ? word.next
        : word.skip;
    if (onLast) fillSummary();
    if (opts.push)
      history.pushState({ wz: current }, '', `#step-${current + 1}`);
    if (opts.focus) {
      scrollTo({
        top: Math.max(0, root.getBoundingClientRect().top + scrollY - 80),
        behavior: reduce ? 'auto' : 'smooth',
      });
      steps[current]!.querySelector<HTMLElement>('h2')?.focus({
        preventScroll: true,
      });
    }
  };

  const fillSummary = () => {
    summary.replaceChildren();
    const picks: [number, string][] = [];
    for (const [i, step] of steps.entries()) {
      if (i === last - 1) continue;
      for (const input of step.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]:checked',
      )) {
        const label = input.dataset.label;
        if (label) picks.push([i, label]);
      }
    }
    for (const [i, label] of picks) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${label} · ${word.change}`;
      button.addEventListener('click', () =>
        show(i, { focus: true, push: true }),
      );
      li.appendChild(button);
      summary.appendChild(li);
    }
    summary.hidden = picks.length === 0;
  };

  const go = (delta: number) =>
    show(current + delta, { focus: true, push: delta > 0 });

  next.addEventListener('click', () => go(1));
  back.addEventListener('click', () =>
    history.state?.wz > 0 ? history.back() : go(-1),
  );
  addEventListener('popstate', (event) =>
    show(typeof event.state?.wz === 'number' ? event.state.wz : 0, {
      focus: true,
    }),
  );

  // Picture cards and the "when" rows move on by themselves after a tap or click (also when the choice was already ticked). A keyboard arrow
  // only selects (event.detail is 0), so someone browsing the cards by keyboard is not carried off after the first one.
  for (const input of root.querySelectorAll<HTMLInputElement>(
    '[data-wz-pick]',
  )) {
    input.addEventListener('click', (event) => {
      next.textContent = word.next;
      if (event.detail > 0) setTimeout(() => go(1), reduce ? 0 : 220);
    });
  }
  for (const input of root.querySelectorAll<HTMLInputElement>(
    'input[name="area"]',
  )) {
    input.addEventListener('change', () => (next.textContent = word.next));
  }
  // Enter in a text box on an early step means Next, not Send.
  root.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (
      event.key === 'Enter' &&
      current < last - 1 &&
      target instanceof HTMLInputElement &&
      target.type === 'text'
    ) {
      event.preventDefault();
      go(1);
    }
  });

  // A link to a field on another step (the error summary's "#name") opens that step first.
  const hashStep = () => {
    const target =
      location.hash.length > 1
        ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
        : null;
    return target ? steps.findIndex((s) => s.contains(target)) : -1;
  };
  const fromHash = hashStep();
  const start = fromHash >= 0 ? fromHash : Number(root.dataset.start ?? 1) - 1;
  history.replaceState(
    { wz: start },
    '',
    location.pathname +
      location.search +
      (start > 0 ? `#step-${start + 1}` : ''),
  );
  show(start, { focus: false });
  addEventListener('hashchange', () => {
    const index = hashStep();
    if (index >= 0) show(index, { focus: false });
  });
}
