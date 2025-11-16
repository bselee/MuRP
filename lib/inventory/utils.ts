import type { Vendor, BillOfMaterials } from '../../types';

export function normalizeCategory(value?: string | null): string {
  if (!value) return 'Uncategorized';
  const trimmed = value.trim();
  return trimmed || 'Uncategorized';
}

function registerLookup<T>(map: Map<string, T>, key: string | undefined | null, value: T) {
  if (!key) return;
  const trimmed = key.trim();
  if (!trimmed) return;
  map.set(trimmed, value);
  map.set(trimmed.toLowerCase(), value);
}

export function buildVendorNameMap(vendors: Vendor[]): Map<string, string> {
  const map = new Map<string, string>();
  vendors.forEach((vendor) => {
    registerLookup(map, vendor.id, vendor.name);
    registerLookup(map, vendor.name, vendor.name);
  });
  map.set('unknown', 'Unknown Vendor');
  map.set('unknown_vendor', 'Unknown Vendor');
  map.set('n/a', 'N/A');
  map.set('N/A', 'N/A');
  return map;
}

export function buildVendorDetailMap(vendors: Vendor[]): Map<string, Vendor> {
  const map = new Map<string, Vendor>();
  vendors.forEach((vendor) => {
    registerLookup(map, vendor.id, vendor);
    registerLookup(map, vendor.name, vendor);
  });
  return map;
}

export function getVendorDisplayName(identifier: string | undefined | null, vendorMap: Map<string, string>): string {
  if (!identifier) return 'N/A';
  const trimmed = identifier.trim();
  if (!trimmed) return 'N/A';
  return vendorMap.get(trimmed) || vendorMap.get(trimmed.toLowerCase()) || trimmed;
}

export function getVendorRecord(identifier: string | undefined | null, vendorDetailMap: Map<string, Vendor>): Vendor | undefined {
  if (!identifier) return undefined;
  const trimmed = identifier.trim();
  if (!trimmed) return undefined;
  return vendorDetailMap.get(trimmed) || vendorDetailMap.get(trimmed.toLowerCase());
}

export interface BomUsageDetail {
  finishedSku: string;
  finishedName: string;
}

export interface BomAssociations {
  usageMap: Map<string, BomUsageDetail[]>;
  finishedSkuSet: Set<string>;
  nameMap: Map<string, string>;
}

export function buildBomAssociations(boms: BillOfMaterials[]): BomAssociations {
  const usageMap = new Map<string, BomUsageDetail[]>();
  const finishedSkuSet = new Set<string>();
  const nameMap = new Map<string, string>();

  boms.forEach((bom) => {
    const finishedSku = bom.finishedSku.trim();
    const finishedName = bom.name?.trim() || finishedSku;
    finishedSkuSet.add(finishedSku);
    nameMap.set(finishedSku, finishedName);

    bom.components.forEach((component) => {
      const list = usageMap.get(component.sku) || [];
      if (!list.some((entry) => entry.finishedSku === finishedSku)) {
        list.push({ finishedSku, finishedName });
        usageMap.set(component.sku, list);
      }
    });
  });

  usageMap.forEach((list, sku) => {
    const sorted = [...list].sort((a, b) => a.finishedName.localeCompare(b.finishedName));
    usageMap.set(sku, sorted);
  });

  return { usageMap, finishedSkuSet, nameMap };
}

export function getBomDetailsForComponent(
  componentSku: string,
  usageMap: Map<string, BomUsageDetail[]>,
): BomUsageDetail[] {
  const details = usageMap.get(componentSku) || [];
  return details.map((entry) => ({ ...entry }));
}
