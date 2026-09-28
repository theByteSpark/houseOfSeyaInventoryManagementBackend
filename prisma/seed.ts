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
    { type: 'METAL', label: 'Gold', sortOrder: 0 },
    { type: 'METAL', label: 'Silver', sortOrder: 1 },
    { type: 'METAL', label: 'Platinum', sortOrder: 2 },
    { type: 'METAL', label: 'Rose Gold', sortOrder: 3 },
    { type: 'METAL', label: 'White Gold', sortOrder: 4 },
    { type: 'DIAMOND_SHAPE', label: 'Square', sortOrder: 0 },
    { type: 'DIAMOND_SHAPE', label: 'Round', sortOrder: 1 },
    { type: 'DIAMOND_SHAPE', label: 'Oval', sortOrder: 2 },
    { type: 'DIAMOND_SHAPE', label: 'Princess', sortOrder: 3 },
    { type: 'DIAMOND_SHAPE', label: 'Emerald', sortOrder: 4 },
    { type: 'DIAMOND_SHAPE', label: 'Pear', sortOrder: 5 },
    { type: 'DIAMOND_SHAPE', label: 'Heart', sortOrder: 6 },
    { type: 'DIAMOND_SHAPE', label: 'Cushion', sortOrder: 7 },
    { type: 'DIAMOND_SHAPE', label: 'Marquise', sortOrder: 8 },
    { type: 'DIAMOND_SHAPE', label: 'Asscher', sortOrder: 9 },
    { type: 'DIAMOND_QUALITY', label: 'Q1', sortOrder: 0 },
    { type: 'DIAMOND_QUALITY', label: 'Q2', sortOrder: 1 },
    { type: 'DIAMOND_QUALITY', label: 'Q3', sortOrder: 2 },
    { type: 'DIAMOND_QUALITY', label: 'VVS1', sortOrder: 3 },
    { type: 'DIAMOND_QUALITY', label: 'VVS2', sortOrder: 4 },
    { type: 'DIAMOND_QUALITY', label: 'VS1', sortOrder: 5 },
    { type: 'DIAMOND_QUALITY', label: 'VS2', sortOrder: 6 },
  ];
  for (const opt of attributeOptions) {
    await prisma.attributeOption.upsert({
      where: { type_label: { type: opt.type, label: opt.label } },
      update: {},
      create: opt,
    });
  }

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
      metalType: 'Gold',
      grossWeight: 4.2,
      metalRatePerGram: 6200,
      makingChargePerGram: 450,
      fixedExpense: 500,
      sellingPrice: 68000,
      quantityInStock: 6,
      reorderLevel: 2,
      subcategoryKey: 'Rings/Engagement',
      diamond: { shape: 'Round', quality: 'Q1', pieces: 1, caratWeight: 0.5, weight: 0.1, rate: 45000 },
    },
    {
      designNumber: 'RNG-CKT-002',
      name: 'Halo Cocktail Ring',
      metalType: 'Gold',
      grossWeight: 5.8,
      metalRatePerGram: 6200,
      makingChargePerGram: 500,
      fixedExpense: 600,
      sellingPrice: 92000,
      quantityInStock: 4,
      reorderLevel: 2,
      subcategoryKey: 'Rings/Cocktail',
      diamond: { shape: 'Round', quality: 'Q1', pieces: 1, caratWeight: 0.75, weight: 0.15, rate: 46000 },
    },
    {
      designNumber: 'NCK-CHN-010',
      name: 'Rope Chain — 18in',
      metalType: 'Gold',
      grossWeight: 12.5,
      metalRatePerGram: 6200,
      makingChargePerGram: 350,
      fixedExpense: 300,
      sellingPrice: 95000,
      quantityInStock: 10,
      reorderLevel: 3,
      subcategoryKey: 'Necklaces/Chains',
      diamond: null,
    },
    {
      designNumber: 'NCK-PND-011',
      name: 'Solitaire Pendant',
      metalType: 'Gold',
      grossWeight: 2.1,
      metalRatePerGram: 6200,
      makingChargePerGram: 400,
      fixedExpense: 250,
      sellingPrice: 32000,
      quantityInStock: 15,
      reorderLevel: 5,
      subcategoryKey: 'Necklaces/Pendants',
      diamond: { shape: 'Round', quality: 'Q2', pieces: 1, caratWeight: 0.3, weight: 0.06, rate: 32000 },
    },
    {
      designNumber: 'EAR-STD-020',
      name: 'Classic Silver Studs',
      metalType: 'Silver',
      grossWeight: 3.0,
      metalRatePerGram: 85,
      makingChargePerGram: 150,
      fixedExpense: 100,
      sellingPrice: 2200,
      quantityInStock: 40,
      reorderLevel: 10,
      subcategoryKey: 'Earrings/Studs',
      diamond: null,
    },
    {
      designNumber: 'EAR-HOP-021',
      name: 'Diamond Hoop Earrings',
      metalType: 'Gold',
      grossWeight: 6.4,
      metalRatePerGram: 6200,
      makingChargePerGram: 420,
      fixedExpense: 400,
      sellingPrice: 78000,
      quantityInStock: 5,
      reorderLevel: 2,
      subcategoryKey: 'Earrings/Hoops',
      diamond: { shape: 'Square', quality: 'Q1', pieces: 16, caratWeight: 0.9, weight: 0.18, rate: 20000 },
    },
    {
      designNumber: 'BRC-BNG-030',
      name: 'Silver Bangle Set (2pc)',
      metalType: 'Silver',
      grossWeight: 22.0,
      metalRatePerGram: 85,
      makingChargePerGram: 120,
      fixedExpense: 200,
      sellingPrice: 4200,
      quantityInStock: 5,
      reorderLevel: 10,
      subcategoryKey: 'Bracelets/Bangles',
      diamond: null,
    },
    {
      designNumber: 'BRC-BNG-031',
      name: 'Gold Tennis Bracelet',
      metalType: 'Gold',
      grossWeight: 9.6,
      metalRatePerGram: 6200,
      makingChargePerGram: 480,
      fixedExpense: 450,
      sellingPrice: 145000,
      quantityInStock: 3,
      reorderLevel: 1,
      subcategoryKey: 'Bracelets/Bangles',
      diamond: { shape: 'Round', quality: 'Q1', pieces: 24, caratWeight: 1.2, weight: 0.24, rate: 44000 },
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
        diamondWeight: p.diamond?.weight,
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
