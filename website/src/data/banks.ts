export type Bank = {
	id: string;
	name: string;
	kind: 'bank' | 'card' | 'other';
	color: string;
	blurb: string;
	/** Used to fetch the brand logo at build time. */
	domain?: string;
};

export const BANKS: Bank[] = [
	{ id: 'isracard', name: 'Isracard', kind: 'card', color: '#E50019', blurb: 'Israeli Mastercard / Visa', domain: 'isracard.co.il' },
	{ id: 'cal', name: 'Visa Cal', kind: 'card', color: '#1B4E97', blurb: 'Cal-branded cards', domain: 'cal-online.co.il' },
	{ id: 'max', name: 'Max', kind: 'card', color: '#FF6B00', blurb: 'Formerly Leumi Card', domain: 'max.co.il' },
	{ id: 'amex', name: 'American Express IL', kind: 'card', color: '#006FCF', blurb: 'Israel-issued Amex', domain: 'americanexpress.co.il' },
	{ id: 'hapoalim', name: 'Bank Hapoalim', kind: 'bank', color: '#E2231A', blurb: 'Personal & business', domain: 'bankhapoalim.com' },
	{ id: 'leumi', name: 'Bank Leumi', kind: 'bank', color: '#1976A4', blurb: 'Personal & business', domain: 'leumi.co.il' },
	{ id: 'mizrahi', name: 'Mizrahi Tefahot', kind: 'bank', color: '#0066B3', blurb: 'Personal & mortgage', domain: 'mizrahi-tefahot.co.il' },
	{ id: 'discount', name: 'Bank Discount', kind: 'bank', color: '#2E9C5C', blurb: 'Personal & business', domain: 'discountbank.co.il' },
	{ id: 'mercantile', name: 'Mercantile Discount', kind: 'bank', color: '#1A7F4B', blurb: 'Discount group', domain: 'mercantile.co.il' },
	{ id: 'fibi', name: 'First International (FIBI)', kind: 'bank', color: '#003C71', blurb: 'FIBI group', domain: 'fibi.co.il' },
	{ id: 'otsar', name: 'Otsar Hahayal', kind: 'bank', color: '#1A5276', blurb: 'FIBI group', domain: 'bankotsar.co.il' },
	{ id: 'pagi', name: 'Bank Pagi', kind: 'bank', color: '#1F4E79', blurb: 'FIBI group', domain: 'pagi.co.il' },
	{ id: 'yahav', name: 'Bank Yahav', kind: 'bank', color: '#005EB8', blurb: 'Civil servants (6 mo history)', domain: 'bank-yahav.co.il' },
	{ id: 'massad', name: 'Bank Massad', kind: 'bank', color: '#003E7E', blurb: 'Personal banking', domain: 'bankmassad.co.il' },
	{ id: 'union', name: 'Union Bank', kind: 'bank', color: '#1F3864', blurb: 'Personal & business', domain: 'unionbank.co.il' },
	{ id: 'onezero', name: 'One Zero', kind: 'bank', color: '#000000', blurb: 'Digital bank (2FA supported)', domain: 'onezerobank.com' },
	{ id: 'beyahad', name: 'Beyahad Bishvilha', kind: 'other', color: '#7B2D8E', blurb: 'Benefit scheme', domain: 'beyahad.co.il' },
	{ id: 'behatsdaa', name: 'Behatsdaa', kind: 'other', color: '#5F8B3A', blurb: 'Benefit scheme', domain: 'behatsdaa.org.il' },
];
