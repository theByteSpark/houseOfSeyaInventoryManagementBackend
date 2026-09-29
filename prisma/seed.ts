import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@houseofseya.com' },
    update: {},
    create: {
      name: 'Seya Admin',
      email: 'admin@houseofseya.com',
      passwordHash,
      role: 'ADMIN',
    },
  });

  const attributeOptions: { type: 'METAL' | 'DIAMOND_SHAPE' | 'DIAMOND_QUALITY'; label: string; sortOrder: number }[] = [
    { type: 'METAL', label: 'Silver 92.5', sortOrder: 0 },
    { type: 'METAL', label: 'Gold 9kt', sortOrder: 1 },
    { type: 'METAL', label: 'Gold 14kt', sortOrder: 2 },
    { type: 'METAL', label: 'Gold 18kt', sortOrder: 3 },
    { type: 'DIAMOND_SHAPE', label: 'Round', sortOrder: 0 },
    { type: 'DIAMOND_SHAPE', label: 'Mix', sortOrder: 1 },
    { type: 'DIAMOND_SHAPE', label: 'Custom', sortOrder: 2 },
    { type: 'DIAMOND_QUALITY', label: 'EF vvs/vs', sortOrder: 0 },
    { type: 'DIAMOND_QUALITY', label: 'EF vvs', sortOrder: 1 },
  ];
  for (const opt of attributeOptions) {
    await prisma.attributeOption.upsert({
      where: { type_label: { type: opt.type, label: opt.label } },
      update: {},
      create: opt,
    });
  }
  // Prune options that used to be seeded but aren't in the list above anymore,
  // so re-running seed converges to exactly this set instead of only adding to
  // it. Existing products keep whatever string they already have on file —
  // ProductCostSheetSections' withCurrentValue() shows it even once removed
  // from the picker.
  const labelsByType = new Map<string, string[]>();
  for (const opt of attributeOptions) {
    labelsByType.set(opt.type, [...(labelsByType.get(opt.type) ?? []), opt.label]);
  }
  await prisma.attributeOption.deleteMany({
    where: {
      OR: Array.from(labelsByType.entries()).map(([type, labels]) => ({
        type: type as 'METAL' | 'DIAMOND_SHAPE' | 'DIAMOND_QUALITY',
        label: { notIn: labels },
      })),
    },
  });

  const categoryData = [
    { name: 'Rings', subcategories: ['Engagement', 'Cocktail'] },
    { name: 'Necklaces', subcategories: ['Chains', 'Pendants'] },
    { name: 'Earrings', subcategories: ['Studs', 'Hoops'] },
    { name: 'Bracelets', subcategories: ['Bangles'] },
  ];
  const subcategoryIds = new Map<string, string>();
  for (const cat of categoryData) {
    const category = await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: { name: cat.name },
    });
    for (const subName of cat.subcategories) {
      const sub = await prisma.subcategory.upsert({
        where: { categoryId_name: { categoryId: category.id, name: subName } },
        update: {},
        create: { name: subName, categoryId: category.id },
      });
      subcategoryIds.set(`${cat.name}/${subName}`, sub.id);
    }
  }

  const products = [
    {
      designNumber: 'RNG-ENG-001',
      name: 'Solitaire Engagement Ring',
      metalType: 'Gold 18kt',
      grossWeight: 4.2,
      metalRatePerGram: 6200,
      makingChargePerGram: 450,
      fixedExpense: 500,
      sellingPrice: 68000,
      quantityInStock: 6,
      reorderLevel: 2,
      subcategoryKey: 'Rings/Engagement',
      diamond: { shape: 'Round', quality: 'EF vvs', pieces: 1, caratWeight: 0.5, rate: 45000 },
    },
    {
      designNumber: 'RNG-CKT-002',
      name: 'Halo Cocktail Ring',
      metalType: 'Gold 18kt',
      grossWeight: 5.8,
      metalRatePerGram: 6200,
      makingChargePerGram: 500,
      fixedExpense: 600,
      sellingPrice: 92000,
      quantityInStock: 4,
      reorderLevel: 2,
      subcategoryKey: 'Rings/Cocktail',
      diamond: { shape: 'Round', quality: 'EF vvs', pieces: 1, caratWeight: 0.75, rate: 46000 },
    },
    {
      designNumber: 'NCK-CHN-010',
      name: 'Rope Chain — 18in',
      metalType: 'Gold 14kt',
      grossWeight: 12.5,
      metalRatePerGram: 6200,
      makingChargePerGram: 350,
      fixedExpense: 300,
      sellingPrice: 95000,
      quantityInStock: 10,
      reorderLevel: 3,
      subcategoryKey: 'Necklaces/Chains',
      diamond: { shape: 'Round', quality: 'EF vvs/vs', pieces: 1, caratWeight: 0.05, rate: 25000 },
    },
    {
      designNumber: 'NCK-PND-011',
      name: 'Solitaire Pendant',
      metalType: 'Gold 14kt',
      grossWeight: 2.1,
      metalRatePerGram: 6200,
      makingChargePerGram: 400,
      fixedExpense: 250,
      sellingPrice: 32000,
      quantityInStock: 15,
      reorderLevel: 5,
      subcategoryKey: 'Necklaces/Pendants',
      diamond: { shape: 'Round', quality: 'EF vvs/vs', pieces: 1, caratWeight: 0.3, rate: 32000 },
    },
    {
      designNumber: 'EAR-STD-020',
      name: 'Classic Silver Studs',
      metalType: 'Silver 92.5',
      grossWeight: 3.0,
      metalRatePerGram: 85,
      makingChargePerGram: 150,
      fixedExpense: 100,
      sellingPrice: 2200,
      quantityInStock: 40,
      reorderLevel: 10,
      subcategoryKey: 'Earrings/Studs',
      diamond: { shape: 'Round', quality: 'EF vvs/vs', pieces: 2, caratWeight: 0.1, rate: 15000 },
    },
    {
      designNumber: 'EAR-HOP-021',
      name: 'Diamond Hoop Earrings',
      metalType: 'Gold 18kt',
      grossWeight: 6.4,
      metalRatePerGram: 6200,
      makingChargePerGram: 420,
      fixedExpense: 400,
      sellingPrice: 78000,
      quantityInStock: 5,
      reorderLevel: 2,
      subcategoryKey: 'Earrings/Hoops',
      diamond: { shape: 'Custom', quality: 'EF vvs', pieces: 16, caratWeight: 0.9, rate: 20000 },
    },
    {
      designNumber: 'BRC-BNG-030',
      name: 'Silver Bangle Set (2pc)',
      metalType: 'Silver 92.5',
      grossWeight: 22.0,
      metalRatePerGram: 85,
      makingChargePerGram: 120,
      fixedExpense: 200,
      sellingPrice: 4200,
      quantityInStock: 5,
      reorderLevel: 10,
      subcategoryKey: 'Bracelets/Bangles',
      diamond: { shape: 'Custom', quality: 'EF vvs/vs', pieces: 4, caratWeight: 0.2, rate: 12000 },
    },
    {
      designNumber: 'BRC-BNG-031',
      name: 'Gold Tennis Bracelet',
      metalType: 'Gold 18kt',
      grossWeight: 9.6,
      metalRatePerGram: 6200,
      makingChargePerGram: 480,
      fixedExpense: 450,
      sellingPrice: 145000,
      quantityInStock: 3,
      reorderLevel: 1,
      subcategoryKey: 'Bracelets/Bangles',
      diamond: { shape: 'Mix', quality: 'EF vvs', pieces: 24, caratWeight: 1.2, rate: 44000 },
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { designNumber: p.designNumber },
      update: {},
      create: {
        designNumber: p.designNumber,
        name: p.name,
        metalType: p.metalType,
        grossWeight: p.grossWeight,
        metalRatePerGram: p.metalRatePerGram,
        diamondShape: p.diamond?.shape,
        diamondQuality: p.diamond?.quality,
        diamondPieces: p.diamond?.pieces,
        diamondCaratWeight: p.diamond?.caratWeight,
        diamondRate: p.diamond?.rate,
        makingChargePerGram: p.makingChargePerGram,
        fixedExpense: p.fixedExpense,
        sellingPrice: p.sellingPrice,
        quantityInStock: p.quantityInStock,
        reorderLevel: p.reorderLevel,
        subcategoryId: subcategoryIds.get(p.subcategoryKey),
      },
    });

    const existingMovement = await prisma.stockMovement.findFirst({ where: { productId: product.id } });
    if (!existingMovement && p.quantityInStock > 0) {
      await prisma.stockMovement.create({
        data: { productId: product.id, type: 'RESTOCK', quantity: p.quantityInStock, reason: 'Initial stock' },
      });
    }
  }

  const customers = [
    { name: 'Atelier Moreau', email: 'orders@ateliermoreau.fr', phone: '+33 1 42 68 53 00', address: '12 Rue de la Paix, Paris, France' },
    { name: 'Cascade Studio', email: 'hello@cascadestudio.com', phone: '+1 415 555 0182', address: '480 Folsom St, San Francisco, CA' },
    { name: 'Meridian Tailors', email: 'contact@meridiantailors.in', phone: '+91 98200 12345', address: 'Linking Road, Mumbai, India' },
    { name: 'Nordic Thread Co.', email: null, phone: '+46 8 123 456', address: 'Storgatan 4, Stockholm, Sweden' },
  ];

  for (const c of customers) {
    const existing = await prisma.customer.findFirst({ where: { name: c.name } });
    if (!existing) {
      await prisma.customer.create({ data: c });
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
