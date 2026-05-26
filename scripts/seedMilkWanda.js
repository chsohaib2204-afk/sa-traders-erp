const path = require('path');
const { PrismaClient } = require('../src/database/generated');
const dbPath = path.resolve(__dirname, '..', 'src', 'database', 'dev.db');
const prisma = new PrismaClient({
  datasources: { db: { url: 'file:' + dbPath } }
});

// Format: name, qtyKg, costPrice, sellPrice
// "Chokar sahiwal - 50 - 70" → qty=50, cost not given, using sell price as cost
const RAW_MATERIALS = [
  { name: 'Banola', qtyKg: 80, costPrice: 97.5, sellPrice: 105 },
  { name: 'Soyabean meal', qtyKg: 10, costPrice: 200, sellPrice: 220 },
  { name: 'Chokar', qtyKg: 60, costPrice: 82, sellPrice: 85 },
  { name: 'Chokar sahiwal', qtyKg: 50, costPrice: 70, sellPrice: 70 },
  { name: 'Makai', qtyKg: 100, costPrice: 75, sellPrice: 80 },
  { name: 'Rice polish', qtyKg: 60, costPrice: 45, sellPrice: 55 },
  { name: 'DCP', qtyKg: 3, costPrice: 40, sellPrice: 100 },
  { name: 'White salt', qtyKg: 4, costPrice: 16, sellPrice: 20 },
  { name: 'Soda', qtyKg: 2, costPrice: 124, sellPrice: 132 },
  { name: 'Sugar', qtyKg: 3, costPrice: 100, sellPrice: 100 },
  { name: 'Sheera', qtyKg: 40, costPrice: 40, sellPrice: 50 }
];

async function main() {
  // 1. Create or get "Milk Wanda" product
  let milkWanda = await prisma.product.findFirst({ where: { name: 'Milk Wanda' } });
  if (!milkWanda) {
    milkWanda = await prisma.product.create({
      data: {
        name: 'Milk Wanda',
        sku: 'MILK-WANDA',
        category: 'Wanda',
        type: 'MANUFACTURED',
        unit: 'bag',
        defaultPrice: 0, // will be calculated from recipe cost
        loyalPrice: 0,
        lowStockAlert: 10
      }
    });
    console.log('Created product: Milk Wanda (MANUFACTURED, bag)');
  } else {
    console.log('Found existing: Milk Wanda');
  }

  // 2. Create/get raw materials and collect recipe items
  const recipeItems = [];
  let totalFormulaKg = 0;

  for (const rm of RAW_MATERIALS) {
    let prod = await prisma.product.findFirst({ where: { name: rm.name } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          name: rm.name,
          category: 'Raw Material',
          type: 'RAW_MATERIAL',
          unit: 'kg',
          defaultPrice: rm.sellPrice,
          loyalPrice: rm.sellPrice,
          lowStockAlert: 10
        }
      });
      console.log('Created raw material:', rm.name);
    } else {
      console.log('Found existing:', rm.name);
    }

    recipeItems.push({
      productId: prod.id,
      quantity: rm.qtyKg,
      unit: 'kg'
    });
    totalFormulaKg += rm.qtyKg;
  }

  // 3. Create the recipe
  const existingRecipe = await prisma.recipe.findFirst({ where: { productId: milkWanda.id } });
  if (existingRecipe) {
    // Update existing recipe
    await prisma.recipeItem.deleteMany({ where: { recipeId: existingRecipe.id } });
    await prisma.recipe.update({
      where: { id: existingRecipe.id },
      data: {
        name: 'Milk Wanda Premium Formula',
        outputQuantity: totalFormulaKg,
        recipeItems: {
          create: recipeItems.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unit: 'kg'
          }))
        }
      }
    });
    console.log('Updated recipe: Milk Wanda Premium Formula (' + totalFormulaKg + ' kg total)');
  } else {
    await prisma.recipe.create({
      data: {
        productId: milkWanda.id,
        name: 'Milk Wanda Premium Formula',
        outputQuantity: totalFormulaKg,
        recipeItems: {
          create: recipeItems.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unit: 'kg'
          }))
        }
      }
    });
    console.log('Created recipe: Milk Wanda Premium Formula (' + totalFormulaKg + ' kg total)');
  }

  // 4. Print summary
  console.log('\n=== Milk Wanda Formula Summary ===');
  console.log('Total formula weight: ' + totalFormulaKg + ' kg');
  console.log('Equivalent: ' + (totalFormulaKg / 40).toFixed(1) + ' bags (at 40kg/bag)');
  console.log('\nIngredients:');
  RAW_MATERIALS.forEach(rm => {
    console.log('  ' + rm.name.padEnd(18) + rm.qtyKg + ' kg  cost: Rs.' + rm.costPrice + '/kg  sell: Rs.' + rm.sellPrice + '/kg');
  });

  // Calculate estimated cost per bag
  const totalCost = RAW_MATERIALS.reduce((sum, rm) => sum + rm.qtyKg * rm.costPrice, 0);
  const costPerKg = totalCost / totalFormulaKg;
  const costPerBag = costPerKg * 40;
  console.log('\nEstimated cost: Rs.' + costPerKg.toFixed(0) + '/kg  Rs.' + costPerBag.toFixed(0) + '/bag');

  // 5. Update Milk Wanda defaultPrice to estimated sell price
  const estimatedMargin = 1.15; // 15% margin
  const sellPricePerKg = costPerKg * estimatedMargin;
  const sellPricePerBag = sellPricePerKg * 40;
  await prisma.product.update({
    where: { id: milkWanda.id },
    data: {
      defaultPrice: Math.round(sellPricePerBag),
      loyalPrice: Math.round(sellPricePerBag)
    }
  });
  console.log('\nMilk Wanda selling price set to: Rs.' + Math.round(sellPricePerBag) + '/bag (Rs.' + Math.round(sellPricePerKg) + '/kg)');

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
