export const BANKS = [
  'Ipak Yo\'li',
  'Hamkorbank',
  'Agrobank',
  'Asaka',
  'Kapitalbank',
  'TBC Bank',
  'Anorbank',
  'Orient Finans',
  'Ziraat Bank',
  'Boshqa',
] as const;

export type BankName = (typeof BANKS)[number];
