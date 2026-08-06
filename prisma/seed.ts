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

  const categoryData = [
    { name: 'Fabrics', subcategories: ['Cotton', 'Linen', 'Silk'] },
    { name: 'Threads & Yarn', subcategories: ['Thread', 'Yarn'] },
    { name: 'Trims & Accessories', subcategories: ['Buttons', 'Zippers'] },
    { name: 'Packaging', subcategories: ['Boxes'] },
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
    { sku: 'FAB-COT-001', name: 'Cotton Poplin — Ivory', description: 'Premium combed cotton poplin, 60" width', unitPrice: 8.5, quantityInStock: 240, reorderLevel: 50, subcategoryKey: 'Fabrics/Cotton' },
    { sku: 'FAB-LIN-002', name: 'Linen Blend — Slate Grey', description: '55% linen / 45% cotton blend', unitPrice: 12.0, quantityInStock: 18, reorderLevel: 30, subcategoryKey: 'Fabrics/Linen' },
    { sku: 'FAB-SLK-003', name: 'Mulberry Silk — Champagne', description: '19mm momme silk charmeuse', unitPrice: 34.0, quantityInStock: 65, reorderLevel: 20, subcategoryKey: 'Fabrics/Silk' },
    { sku: 'THR-POL-010', name: 'Polyester Thread — Black (5000m)', description: 'Industrial-grade sewing thread', unitPrice: 3.2, quantityInStock: 12, reorderLevel: 25, subcategoryKey: 'Threads & Yarn/Thread' },
    { sku: 'YRN-WOL-011', name: 'Merino Wool Yarn — Charcoal', description: '100g skeins, DK weight', unitPrice: 6.75, quantityInStock: 88, reorderLevel: 20, subcategoryKey: 'Threads & Yarn/Yarn' },
    { sku: 'TRM-BTN-020', name: 'Mother-of-Pearl Buttons (12mm)', description: 'Pack of 100', unitPrice: 9.9, quantityInStock: 40, reorderLevel: 15, subcategoryKey: 'Trims & Accessories/Buttons' },
    { sku: 'TRM-ZIP-021', name: 'Invisible Zippers — 22" Navy', description: 'Pack of 20', unitPrice: 15.4, quantityInStock: 5, reorderLevel: 10, subcategoryKey: 'Trims & Accessories/Zippers' },
    { sku: 'PKG-BOX-030', name: 'Garment Boxes — Kraft (Medium)', description: 'Pack of 50, foldable', unitPrice: 22.0, quantityInStock: 130, reorderLevel: 40, subcategoryKey: 'Packaging/Boxes' },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        description: p.description,
        unitPrice: p.unitPrice,
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
