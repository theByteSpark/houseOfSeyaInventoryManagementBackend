import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const warehouse = await prisma.warehouse.upsert({
    where: { name: 'Main Warehouse' },
    update: {},
    create: { name: 'Main Warehouse', code: 'MAIN' },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'superadmin@houseofseya.com' },
    update: {},
    create: {
      name: 'Seya Super Admin',
      email: 'superadmin@houseofseya.com',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@paragonresin.com' },
    update: {},
    create: {
      name: 'Paragon Resin Admin',
      email: 'admin@paragonresin.com',
      passwordHash,
      role: 'COMPANY_ADMIN',
    },
  });

  const warehouseAdmin = await prisma.user.upsert({
    where: { email: 'warehouse.admin@houseofseya.com' },
    update: {},
    create: {
      name: 'Warehouse Admin',
      email: 'warehouse.admin@houseofseya.com',
      passwordHash,
      role: 'ADMIN',
    },
  });
  await prisma.userWarehouse.upsert({
    where: { userId: warehouseAdmin.id },
    update: { warehouseId: warehouse.id },
    create: { userId: warehouseAdmin.id, warehouseId: warehouse.id },
  });

  const categoryData = ['Fabrics', 'Threads & Yarn', 'Trims & Accessories', 'Packaging'];
  const categoryIds = new Map<string, string>();
  for (const name of categoryData) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryIds.set(name, category.id);
  }

  const products = [
    { sku: 'FAB-COT-001', name: 'Cotton Poplin — Ivory', description: 'Premium combed cotton poplin, 60" width', unitPrice: 8.5, quantityInStock: 240, reorderLevel: 50, categoryKey: 'Fabrics' },
    { sku: 'FAB-LIN-002', name: 'Linen Blend — Slate Grey', description: '55% linen / 45% cotton blend', unitPrice: 12.0, quantityInStock: 18, reorderLevel: 30, categoryKey: 'Fabrics' },
    { sku: 'FAB-SLK-003', name: 'Mulberry Silk — Champagne', description: '19mm momme silk charmeuse', unitPrice: 34.0, quantityInStock: 65, reorderLevel: 20, categoryKey: 'Fabrics' },
    { sku: 'THR-POL-010', name: 'Polyester Thread — Black (5000m)', description: 'Industrial-grade sewing thread', unitPrice: 3.2, quantityInStock: 12, reorderLevel: 25, categoryKey: 'Threads & Yarn' },
    { sku: 'YRN-WOL-011', name: 'Merino Wool Yarn — Charcoal', description: '100g skeins, DK weight', unitPrice: 6.75, quantityInStock: 88, reorderLevel: 20, categoryKey: 'Threads & Yarn' },
    { sku: 'TRM-BTN-020', name: 'Mother-of-Pearl Buttons (12mm)', description: 'Pack of 100', unitPrice: 9.9, quantityInStock: 40, reorderLevel: 15, categoryKey: 'Trims & Accessories' },
    { sku: 'TRM-ZIP-021', name: 'Invisible Zippers — 22" Navy', description: 'Pack of 20', unitPrice: 15.4, quantityInStock: 5, reorderLevel: 10, categoryKey: 'Trims & Accessories' },
    { sku: 'PKG-BOX-030', name: 'Garment Boxes — Kraft (Medium)', description: 'Pack of 50, foldable', unitPrice: 22.0, quantityInStock: 130, reorderLevel: 40, categoryKey: 'Packaging' },
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
        reorderLevel: p.reorderLevel,
        categoryId: categoryIds.get(p.categoryKey),
      },
    });

    const existingStock = await prisma.productStock.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    if (!existingStock) {
      await prisma.productStock.create({
        data: { productId: product.id, warehouseId: warehouse.id, quantity: p.quantityInStock },
      });
      if (p.quantityInStock > 0) {
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            warehouseId: warehouse.id,
            type: 'RESTOCK',
            quantity: p.quantityInStock,
            reason: 'Initial stock',
          },
        });
      }
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
