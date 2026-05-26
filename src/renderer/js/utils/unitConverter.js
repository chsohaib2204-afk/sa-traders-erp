/**
 * Unit Converter Utility - Standardizes all weight calculations in kilograms (kg).
 * 
 * Business Standard:
 * 1 Bag = 40 kg
 * 1 kg = 1000 g
 */

export const BAG_TO_KG = 40.0;
export const KG_TO_GRAMS = 1000.0;

const Converter = {
  /**
   * Converts any value from a given unit to the standard base unit (kg).
   * @param {number} value 
   * @param {string} unit - 'bag' | 'kg' | 'gram'
   * @returns {number} Value in kilograms
   */
  convertToBase(value, unit) {
    const val = parseFloat(value) || 0.0;
    const cleanUnit = (unit || '').toLowerCase().trim();

    switch (cleanUnit) {
      case 'bag':
      case 'bags':
        return val * BAG_TO_KG;
      case 'gram':
      case 'grams':
      case 'g':
        return val / KG_TO_GRAMS;
      case 'kg':
      case 'kgs':
      case 'kilogram':
      case 'kilograms':
      default:
        return val;
    }
  },

  /**
   * Converts a base value in kilograms to a target display unit.
   * @param {number} baseValueInKg 
   * @param {string} targetUnit 
   * @returns {number} Converted value
   */
  convertFromBase(baseValueInKg, targetUnit) {
    const val = parseFloat(baseValueInKg) || 0.0;
    const cleanUnit = (targetUnit || '').toLowerCase().trim();

    switch (cleanUnit) {
      case 'bag':
      case 'bags':
        return val / BAG_TO_KG;
      case 'gram':
      case 'grams':
      case 'g':
        return val * KG_TO_GRAMS;
      case 'kg':
      case 'kgs':
      case 'kilogram':
      case 'kilograms':
      default:
        return val;
    }
  },

  /**
   * Formats a base weight in kilograms into a clean, human-readable display string.
   * Example: 45kg becomes "1 Bag & 5 kg" if unit is bags, or "45 kg" otherwise.
   * @param {number} qtyInKg 
   * @param {string} displayUnit 
   * @returns {string} Formatted string
   */
  formatQty(qtyInKg, displayUnit) {
    const val = parseFloat(qtyInKg) || 0.0;
    const cleanUnit = (displayUnit || '').toLowerCase().trim();

    if (cleanUnit === 'bag' || cleanUnit === 'bags') {
      const bags = Math.floor(val / BAG_TO_KG);
      const remainingKg = val % BAG_TO_KG;
      
      if (bags > 0 && remainingKg > 0) {
        return `${bags} Bag${bags > 1 ? 's' : ''} & ${remainingKg.toFixed(1)} kg`;
      } else if (bags > 0) {
        return `${bags} Bag${bags > 1 ? 's' : ''}`;
      } else {
        return `${remainingKg.toFixed(1)} kg`;
      }
    }

    return `${val.toFixed(2)} ${displayUnit}`;
  },

  normalizeUnit(unit) {
    const u = (unit || 'kg').toLowerCase().trim();
    if (u === 'bags') return 'bag';
    if (u === 'grams' || u === 'g') return 'gram';
    return u;
  },

  /**
   * Product catalog prices are stored per the product's unit (e.g. Rs. 4200 per bag).
   * Returns the selling rate for the invoice line unit.
   */
  getPriceForSaleUnit(amountInProductUnit, productUnit, saleUnit) {
    const from = this.normalizeUnit(productUnit);
    const to = this.normalizeUnit(saleUnit);
    const amount = parseFloat(amountInProductUnit) || 0;

    if (from === to) return amount;

    // Convert catalog price → price per kg → target unit
    let perKg = amount;
    if (from === 'bag') perKg = amount / BAG_TO_KG;
    else if (from === 'gram') perKg = amount * KG_TO_GRAMS;

    if (to === 'bag') return perKg * BAG_TO_KG;
    if (to === 'gram') return perKg / KG_TO_GRAMS;
    return perKg;
  },

  getCatalogPrice(product, priceType) {
    if (!product) return 0;
    return priceType === 'loyal' ? product.loyalPrice : product.defaultPrice;
  }
};

export default Converter;
