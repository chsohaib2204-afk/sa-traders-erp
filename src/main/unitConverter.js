const BAG_TO_KG = 40.0;
const KG_TO_GRAMS = 1000.0;

function convertToKg(quantity, unit) {
  const val = parseFloat(quantity) || 0.0;
  const u = (unit || 'kg').toLowerCase().trim();
  if (u === 'bag' || u === 'bags') return val * BAG_TO_KG;
  if (u === 'gram' || u === 'grams' || u === 'g') return val / KG_TO_GRAMS;
  return val;
}

function convertFromKg(quantityKg, targetUnit) {
  const val = parseFloat(quantityKg) || 0.0;
  const u = (targetUnit || 'kg').toLowerCase().trim();
  if (u === 'bag' || u === 'bags') return val / BAG_TO_KG;
  if (u === 'gram' || u === 'grams' || u === 'g') return val * KG_TO_GRAMS;
  return val;
}

module.exports = { BAG_TO_KG, KG_TO_GRAMS, convertToKg, convertFromKg };
