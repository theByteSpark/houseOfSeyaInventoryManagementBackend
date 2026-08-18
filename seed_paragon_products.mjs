// One-off script: creates the 5 categories (HDPE, PP, LDPE, LLDPE, LLD-HD)
// and their products from the Paragon Plastic Bangalore Depo price list
// (2026-07-27), via the running API. Grade code is used as both sku and
// name. Prices are ignored per instructions.
//
// Usage: API_BASE_URL=... EMAIL=... PASSWORD=... node seed_paragon_products.mjs
// All three env vars are required — no defaults, so this can never
// accidentally run against the wrong environment with the wrong account.

const API_BASE_URL = process.env.API_BASE_URL;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

if (!API_BASE_URL || !EMAIL || !PASSWORD) {
  console.error('Missing required env vars. Usage:');
  console.error('  API_BASE_URL=... EMAIL=... PASSWORD=... node seed_paragon_products.mjs');
  process.exit(1);
}

const CATEGORIES = {
  HDPE: [
    'E52009', 'E52007', 'B56003', 'F46003', 'F60003', 'EE20', '54GC016', 'M60075',
    'L60075', 'HD50MA180', 'B5010', 'B5502', '55EF010', '53EA010', '52GB003',
    '52GB002', '54GB012', '45GP004', '46GP003', 'P4609', '46GP009',
  ],
  PP: [
    'MI3530', 'B030MG', 'C080MA', 'C080MT', 'C015EG', 'D120MA', 'B120MA', 'B650MN',
    'B400MN', 'B220MN', 'H050MN', 'H030SG', 'H033MG', 'N030MG', 'H110MG', 'H060MG',
    'H200MG', 'H110MA', 'H110MAS', 'R120MK', 'H080EY', 'H100EY', 'UHF', 'ULF',
    'SRM100NC', 'SRM250NC', 'SRM100N', 'SR20NC', 'SRX100', 'H200MK', 'H350FG',
    'H350EC', 'AER003N', 'AM010N', 'AM120N', 'AM650N', 'H700MN', 'SM60N', 'SM100N',
  ],
  LDPE: [
    '1005FY20', 'J1005FY20', '1070LA17', '1020FA20', 'J1020FA20', 'J1020FF20',
    '16MA400', '24FS040', 'J24FS040', 'J22FA002E', '22FA002',
  ],
  LLDPE: [
    'F18010', 'JF18010', 'F18020', 'JF18020', 'E19010', 'JD19010', 'JD22010',
    'F19010', 'JF19010', 'F17030', 'JF19020', 'F22020', 'M26500', 'N24300',
    'N22020', 'O20010', 'O19010', 'E24065',
  ],
  'LLD-HD': [
    'LL20FS010', 'LL20FS010N', 'LL20FA010', 'LL20FA010N', 'LL20FS020', 'LL20FS020N',
    'LL20FA020', 'JLL36RA045', 'LL36RA045', 'LL36RA045N', 'LL36RA045UV', 'LL40RA040',
  ],
};

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const { accessToken } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const existingCategories = await api('/inventory/categories', { headers: authHeaders });
  const existingProducts = await api('/inventory/products', { headers: authHeaders });
  const existingSkus = new Set(existingProducts.map((p) => p.sku));

  const categoryIdByName = new Map(existingCategories.map((c) => [c.name, c.id]));

  const summary = { categoriesCreated: 0, productsCreated: 0, productsSkipped: 0 };

  for (const [categoryName, skus] of Object.entries(CATEGORIES)) {
    let categoryId = categoryIdByName.get(categoryName);
    if (!categoryId) {
      const created = await api('/inventory/categories', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: categoryName }),
      });
      categoryId = created.id;
      categoryIdByName.set(categoryName, categoryId);
      summary.categoriesCreated += 1;
      console.log(`Created category: ${categoryName}`);
    } else {
      console.log(`Category already exists, reusing: ${categoryName}`);
    }

    for (const sku of skus) {
      if (existingSkus.has(sku)) {
        console.log(`  Skipping (sku already exists): ${sku}`);
        summary.productsSkipped += 1;
        continue;
      }
      await api('/inventory/products', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          sku,
          name: sku,
          reorderLevel: 0,
          categoryId,
        }),
      });
      existingSkus.add(sku);
      summary.productsCreated += 1;
      console.log(`  Created product: ${sku}`);
    }
  }

  console.log('\nDone.', summary);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
});
