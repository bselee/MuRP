SELECT COUNT(*) as total_pos FROM public.purchase_orders;
SELECT id, order_id, supplier, status, order_date FROM public.purchase_orders LIMIT 5;
SELECT COUNT(*) as total_inventory FROM public.inventory_items;
