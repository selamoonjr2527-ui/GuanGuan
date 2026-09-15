export type ShuttleStockEntryType = 'purchase' | 'opening';

export interface ShuttlePurchase {
  id: string;
  entryType: ShuttleStockEntryType;
  date: string;
  brand?: string;
  model?: string;
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
  createdAt: number;
}

export interface ShuttleInventorySummary {
  purchasedQuantity: number;
  purchaseCost: number;
  usedQuantity: number;
  usedCost: number;
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

export function getShuttleInventorySummary(
  purchases: ShuttlePurchase[],
  usages: ShuttleUsageRecord[],
  fallbackUnitCost = 0
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

  const stockQuantity = purchasedQuantity - usedQuantity;
  const rawStockValue = purchaseCost - usedCost;
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
  fallbackUnitCost = 0
): number {
  const summary = getShuttleInventorySummary(
    purchases,
    usages,
    fallbackUnitCost
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
