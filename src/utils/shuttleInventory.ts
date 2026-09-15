export type ShuttleStockEntryType = 'purchase' | 'opening';

export interface ShuttlePurchase {
  id: string;
  entryType: ShuttleStockEntryType;
  date: string;
  brand?: string;
  model?: string;
  supplier?: string;
  tubes: number;
  piecesPerTube: number;
  pricePerTube: number;
  quantity: number;
  totalCost: number;
  unitCost: number;
  note?: string;
  fundTransactionId?: string;
  createdAt: number;
}

export interface ShuttleUsageRecord {
  id: string;
  historyId: string;
  sessionDate: string;
  courtName?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  memberCount?: number;
  memberRatePerMatch?: number;
  baseMemberRevenue?: number;
  createdAt: number;
}

export interface ShuttleStockAdjustment {
  id: string;
  date: string;
  actualCount: number;
  previousSystemCount: number;
  quantityDelta: number;
  unitCost: number;
  valueDelta: number;
  reason: 'stocktake' | 'damaged' | 'lost' | 'found' | 'other';
  note?: string;
  createdAt: number;
}

export interface ShuttleInventorySummary {
  purchasedQuantity: number;
  purchaseCost: number;
  usedQuantity: number;
  usedCost: number;
  adjustmentQuantity: number;
  adjustmentValue: number;
  stockQuantity: number;
  stockValue: number;
  averageUnitCost: number;
  lastPurchaseUnitCost: number;
}

export function getShuttlePurchases(state: any): ShuttlePurchase[] {
  return Array.isArray(state?.shuttlePurchases) ? state.shuttlePurchases : [];
}

export function getShuttleUsageLedger(state: any): ShuttleUsageRecord[] {
  return Array.isArray(state?.shuttleUsageLedger)
    ? state.shuttleUsageLedger
    : [];
}

export function getShuttleStockAdjustments(state: any): ShuttleStockAdjustment[] {
  return Array.isArray(state?.shuttleStockAdjustments)
    ? state.shuttleStockAdjustments
    : [];
}

export function getShuttleInventorySummary(
  purchases: ShuttlePurchase[],
  usages: ShuttleUsageRecord[],
  fallbackUnitCost = 0,
  adjustments: ShuttleStockAdjustment[] = []
): ShuttleInventorySummary {
  const purchasedQuantity = purchases.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0
  );
  const purchaseCost = purchases.reduce(
    (sum, item) => sum + Math.max(0, Number(item.totalCost || 0)),
    0
  );
  const usedQuantity = usages.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0
  );
  const usedCost = usages.reduce(
    (sum, item) => sum + Math.max(0, Number(item.totalCost || 0)),
    0
  );

  const adjustmentQuantity = adjustments.reduce(
    (sum, item) => sum + Number(item.quantityDelta || 0),
    0
  );
  const adjustmentValue = adjustments.reduce(
    (sum, item) => sum + Number(item.valueDelta || 0),
    0
  );

  const stockQuantity =
    purchasedQuantity - usedQuantity + adjustmentQuantity;
  const rawStockValue =
    purchaseCost - usedCost + adjustmentValue;
  const stockValue = stockQuantity > 0 ? Math.max(0, rawStockValue) : 0;

  const latestPurchase = [...purchases].sort(
    (a, b) => b.createdAt - a.createdAt
  )[0];

  const lastPurchaseUnitCost =
    latestPurchase && Number(latestPurchase.unitCost) > 0
      ? Number(latestPurchase.unitCost)
      : Math.max(0, Number(fallbackUnitCost || 0));

  const averageUnitCost =
    stockQuantity > 0 && stockValue > 0
      ? stockValue / stockQuantity
      : lastPurchaseUnitCost;

  return {
    purchasedQuantity,
    purchaseCost,
    usedQuantity,
    usedCost,
    adjustmentQuantity,
    adjustmentValue,
    stockQuantity,
    stockValue,
    averageUnitCost,
    lastPurchaseUnitCost,
  };
}

/**
 * Moving weighted-average cost immediately BEFORE a new usage is recorded.
 * Purchase prices may differ by lot; every consumed shuttle freezes its cost
 * at the weighted average that existed at the time of consumption.
 */
export function getCurrentShuttleAverageCost(
  purchases: ShuttlePurchase[],
  usages: ShuttleUsageRecord[],
  fallbackUnitCost = 0,
  adjustments: ShuttleStockAdjustment[] = []
): number {
  const summary = getShuttleInventorySummary(
    purchases,
    usages,
    fallbackUnitCost,
    adjustments
  );

  return Math.max(
    0,
    Number(summary.averageUnitCost || fallbackUnitCost || 0)
  );
}

export function getSessionShuttleUsage(
  usages: ShuttleUsageRecord[],
  sessionDate: string
): ShuttleUsageRecord[] {
  return usages.filter((item) => item.sessionDate === sessionDate);
}

export function getSessionShuttleUsageSummary(
  usages: ShuttleUsageRecord[],
  sessionDate: string,
  expectedQuantity = 0,
  fallbackUnitCost = 0
): {
  trackedQuantity: number;
  untrackedQuantity: number;
  quantity: number;
  trackedCost: number;
  untrackedCost: number;
  totalCost: number;
  averageUnitCost: number;
} {
  const sessionRows = getSessionShuttleUsage(usages, sessionDate);

  const trackedQuantity = sessionRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.quantity || 0)),
    0
  );
  const trackedCost = sessionRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.totalCost || 0)),
    0
  );

  // Compatibility for matches that happened before the inventory feature.
  const untrackedQuantity = Math.max(
    0,
    Number(expectedQuantity || 0) - trackedQuantity
  );
  const untrackedCost =
    untrackedQuantity * Math.max(0, Number(fallbackUnitCost || 0));

  const quantity = trackedQuantity + untrackedQuantity;
  const totalCost = trackedCost + untrackedCost;

  return {
    trackedQuantity,
    untrackedQuantity,
    quantity,
    trackedCost,
    untrackedCost,
    totalCost,
    averageUnitCost: quantity > 0 ? totalCost / quantity : 0,
  };
}


export interface ShuttleMonthlySummary {
  month: string;
  purchaseTubes: number;
  purchaseQuantity: number;
  purchaseCashOutflow: number;
  usedQuantity: number;
  usedCost: number;
  baseMemberRevenue: number;
  grossMargin: number;
  averageUsedCost: number;
  averagePurchaseUnitCost: number;
  stockAdjustmentQuantity: number;
  stockAdjustmentValue: number;
  stockLossCost: number;
  matchCount: number;
}

export function getShuttleMonthlySummary(
  purchases: ShuttlePurchase[],
  usages: ShuttleUsageRecord[],
  month: string,
  fallbackMemberRatePerMatch = 25,
  adjustments: ShuttleStockAdjustment[] = []
): ShuttleMonthlySummary {
  const monthKey = /^\d{4}-\d{2}$/.test(month) ? month : '';

  const monthlyPurchases = purchases.filter(
    (item) =>
      item.entryType === 'purchase' &&
      (!monthKey || String(item.date || '').startsWith(monthKey))
  );

  const monthlyUsages = usages.filter(
    (item) => !monthKey || String(item.sessionDate || '').startsWith(monthKey)
  );

  const monthlyAdjustments = adjustments.filter(
    (item) => !monthKey || String(item.date || '').startsWith(monthKey)
  );

  const purchaseTubes = monthlyPurchases.reduce(
    (sum, item) => sum + Math.max(0, Number(item.tubes || 0)),
    0
  );
  const purchaseQuantity = monthlyPurchases.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0
  );
  const purchaseCashOutflow = monthlyPurchases.reduce(
    (sum, item) => sum + Math.max(0, Number(item.totalCost || 0)),
    0
  );

  const usedQuantity = monthlyUsages.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0
  );
  const usedCost = monthlyUsages.reduce(
    (sum, item) => sum + Math.max(0, Number(item.totalCost || 0)),
    0
  );

  const stockAdjustmentQuantity = monthlyAdjustments.reduce(
    (sum, item) => sum + Number(item.quantityDelta || 0),
    0
  );
  const stockAdjustmentValue = monthlyAdjustments.reduce(
    (sum, item) => sum + Number(item.valueDelta || 0),
    0
  );
  const stockLossCost = monthlyAdjustments.reduce(
    (sum, item) =>
      sum + (Number(item.valueDelta || 0) < 0 ? Math.abs(Number(item.valueDelta || 0)) : 0),
    0
  );

  const baseMemberRevenue = monthlyUsages.reduce((sum, item) => {
    if (
      typeof item.baseMemberRevenue === 'number' &&
      Number.isFinite(item.baseMemberRevenue)
    ) {
      return sum + Math.max(0, item.baseMemberRevenue);
    }

    const memberCount =
      typeof item.memberCount === 'number' && item.memberCount > 0
        ? item.memberCount
        : 4;
    const rate =
      typeof item.memberRatePerMatch === 'number' &&
      item.memberRatePerMatch >= 0
        ? item.memberRatePerMatch
        : Math.max(0, fallbackMemberRatePerMatch);

    return sum + memberCount * rate;
  }, 0);

  return {
    month: monthKey,
    purchaseTubes,
    purchaseQuantity,
    purchaseCashOutflow,
    usedQuantity,
    usedCost,
    baseMemberRevenue,
    grossMargin: baseMemberRevenue - usedCost - stockLossCost,
    averageUsedCost: usedQuantity > 0 ? usedCost / usedQuantity : 0,
    averagePurchaseUnitCost:
      purchaseQuantity > 0 ? purchaseCashOutflow / purchaseQuantity : 0,
    stockAdjustmentQuantity,
    stockAdjustmentValue,
    stockLossCost,
    matchCount: monthlyUsages.length,
  };
}


export interface ShuttlePurchasePriceStats {
  count: number;
  latestPricePerTube: number;
  minPricePerTube: number;
  maxPricePerTube: number;
  averagePricePerTube: number;
  latestSupplier?: string;
}

export function getShuttlePurchasePriceStats(
  purchases: ShuttlePurchase[],
  month?: string
): ShuttlePurchasePriceStats {
  const monthKey = month && /^\d{4}-\d{2}$/.test(month) ? month : '';

  const rows = purchases
    .filter(
      (item) =>
        item.entryType === 'purchase' &&
        (!monthKey || String(item.date || '').startsWith(monthKey))
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  if (rows.length === 0) {
    return {
      count: 0,
      latestPricePerTube: 0,
      minPricePerTube: 0,
      maxPricePerTube: 0,
      averagePricePerTube: 0,
    };
  }

  const prices = rows
    .map((item) => Math.max(0, Number(item.pricePerTube || 0)))
    .filter((value) => Number.isFinite(value));

  const latest = rows[0];

  return {
    count: rows.length,
    latestPricePerTube: Math.max(0, Number(latest.pricePerTube || 0)),
    minPricePerTube: Math.min(...prices),
    maxPricePerTube: Math.max(...prices),
    averagePricePerTube:
      prices.length > 0
        ? prices.reduce((sum, value) => sum + value, 0) / prices.length
        : 0,
    latestSupplier: latest.supplier,
  };
}

export function getSuggestedReorder(
  currentStock: number,
  targetStock: number,
  piecesPerTube = 12
): {
  shortagePieces: number;
  suggestedTubes: number;
  suggestedPieces: number;
} {
  const current = Math.max(0, Number(currentStock || 0));
  const target = Math.max(0, Number(targetStock || 0));
  const perTube = Math.max(1, Math.floor(Number(piecesPerTube || 12)));
  const shortagePieces = Math.max(0, target - current);
  const suggestedTubes =
    shortagePieces > 0 ? Math.ceil(shortagePieces / perTube) : 0;

  return {
    shortagePieces,
    suggestedTubes,
    suggestedPieces: suggestedTubes * perTube,
  };
}
