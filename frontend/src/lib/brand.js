// Presentation only: storage keys and import formats remain compatible with existing data.
export const BRAND_NAME = 'Fernando Tienda Training'
export const BRAND_SHORT_NAME = 'FT Training'
export const OFFICIAL_APP_UPDATES = false

// Keep upstream translation keys, then brand the translated template before inserting user data.
export const brandText = text => text.replace(/\ban (?=open\s?gym\b)/gi, 'a ').replace(/(?<!\/)open\s?gym/gi, BRAND_NAME)
