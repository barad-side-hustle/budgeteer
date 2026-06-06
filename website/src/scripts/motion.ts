/**
 * Scroll fade-up motion for landing page sections.
 * - Each `.budgeteer-fade-up` element fades in + translates up when 15% visible.
 * - Skips entirely if user prefers reduced motion.
 * - Auto-unobserves after first reveal (one-shot).
 */
if (typeof window !== 'undefined') {
	const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (prefersReduced) {
		document.querySelectorAll<HTMLElement>('.budgeteer-fade-up').forEach((el) => {
			el.classList.add('is-visible');
		});
	} else {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add('is-visible');
						observer.unobserve(entry.target);
					}
				}
			},
			{ rootMargin: '0px 0px -15% 0px', threshold: 0.05 }
		);

		const setup = () => {
			document
				.querySelectorAll<HTMLElement>('.budgeteer-fade-up:not(.is-visible)')
				.forEach((el) => observer.observe(el));
		};

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', setup, { once: true });
		} else {
			setup();
		}
	}
}
