import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { kirimChiqimDenied } from '@/lib/mobileOrg';
import { aggregateFlowTotals, lineFromProduct, lineFromSale, type FlowLine } from '@/lib/inventoryFlow';

/**
 * Barcha kirim-chiqim — web «Kirim-chiqim → Barcha filiallar batafsil» bilan bir manba:
 * kirim — ombordagi qoldiq (tannarx bo'yicha), chiqim — sotuvlar (tushum), foyda = sotuv − tannarx;
 * bank krediti ulushi foydaga bankdan pul olinganda kiradi (BankReceipt).
 * Barcha faol filiallar bo'yicha; faqat biznes egasi. `?lines=0` — faqat jami (kartaga).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const denied = await kirimChiqimDenied(user);
  if (denied) return denied;

  const { Product, Branch, Sale, BankReceipt } = await getTenantModels(user.dbName);
  const branches = await Branch.find({ active: true }).sort({ createdAt: 1 }).lean();
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const branchIds = branches.map((b) => b._id);

  const [products, sales, receiptSums] = await Promise.all([
    Product.find({ branchId: { $in: branchIds } }).limit(5000).lean(),
    Sale.find({ status: { $ne: 'cancelled' }, branchId: { $in: branchIds } }).sort({ createdAt: -1 }).limit(5000).lean(),
    BankReceipt.aggregate<{ _id: unknown; total: number }>([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);

  const stock: FlowLine[] = [];
  for (const p of products) {
    const line = lineFromProduct(p, branchName.get(String(p.branchId)) ?? '—', 'stock');
    if (line) stock.push(line);
  }
  const sold = sales.map((s) => lineFromSale(s, branchName.get(String(s.branchId)) ?? '—'));
  const totals = aggregateFlowTotals(stock, sold, receiptSums[0]?.total ?? 0);

  const withLines = new URL(req.url).searchParams.get('lines') !== '0';
  return NextResponse.json({
    branches: branches.length,
    totals,
    stockCount: stock.length,
    soldCount: sold.length,
    // Omborda — qiymati kattasi birinchi; sotilgan — eng yangisi birinchi
    ...(withLines ? { stock: stock.sort((a, b) => b.cost - a.cost), sold } : {}),
  });
}
