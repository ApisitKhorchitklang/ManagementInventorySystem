export function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description ?? null,
    unit: row.unit,
    cost_price: row.cost_price,
    stock_quantity: row.stock_quantity,
    low_stock_threshold: row.low_stock_threshold,
    is_low_stock: row.is_low_stock ?? row.stock_quantity < row.low_stock_threshold,
    stock_value: row.stock_value ?? row.stock_quantity * row.cost_price,
    category: { id: row.category_id, name: row.category_name ?? null },
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    product_id: row.product_id,
    product: row.product_sku ? { sku: row.product_sku, name: row.product_name } : undefined,
    type: row.type,
    quantity: row.quantity,
    change: row.type === 'IN' ? row.quantity : -row.quantity,
    balance_before: row.balance_before,
    balance_after: row.balance_after,
    reason: row.reason ?? null,
    created_by: row.created_by ?? null,
    transacted_at: row.transacted_at,
  };
}

export function toCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    product_count: row.product_count !== undefined ? Number(row.product_count) : undefined,
    created_at: row.created_at,
  };
}

export function meta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
