-- =========================================
-- Accounting core schema (orders/payments/shipments/sales)
-- MVP: 출고일 기준 장부 / 선입금 중심
-- =========================================

-- 0) extensions (uuid)
create extension if not exists "pgcrypto";

-- 1) updated_at 자동 갱신용 트리거 함수
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2) 주문(경리 중심)
-- customer_id는 추후 customers 테이블 생기면 연결 가능하게 nullable로 둠
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid null,
  customer_name text not null,         -- 당장 운영상 가장 중요 (거래처명)
  title text null,                     -- 표시용 요약: "아라한-대곡초-..."
  ship_date date not null,             -- 출고예정/확정일 (캘린더 원장)
  ship_method text null,               -- 택배/방문/퀵 등
  status text not null default 'PAID',  -- PAID/WAIT_SHIP/SHIPPED/CANCELED 등 (단순 text로 시작)
  memo text null,

  -- 금액(경리 입력): 공급가/부가세/합계
  supply_amount integer not null default 0,
  vat_amount integer not null default 0,
  total_amount integer not null default 0,

  created_by uuid null,                -- auth.users.id (옵션)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create index if not exists idx_orders_ship_date on public.orders(ship_date);
create index if not exists idx_orders_status on public.orders(status);

-- 3) 입금(선입금 중심)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount integer not null,              -- 입금액
  paid_at timestamptz not null default now(),
  method text null,                    -- 계좌이체/카드 등
  memo text null,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_payments_paid_at on public.payments(paid_at);

-- 4) 출고 헤더(출고 직원 실행 단위)
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,

  shipped_at timestamptz null,          -- 실제 출고 완료 시각
  status text not null default 'READY', -- READY/IN_PROGRESS/DONE/CANCELED
  memo text null,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_shipments_updated_at on public.shipments;
create trigger trg_shipments_updated_at
before update on public.shipments
for each row execute function public.set_updated_at();

create index if not exists idx_shipments_order_id on public.shipments(order_id);
create index if not exists idx_shipments_shipped_at on public.shipments(shipped_at);

-- 5) 출고 라인(재고 OUT과 연결될 라인)
-- NOTE: 아래 variant_id 타입은 프로젝트 기존 product_variants 타입에 맞춰야 함.
--       기존이 text면 uuid -> text로 바꾸세요.
create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,

  variant_id uuid not null,             -- product_variants.variant_id (타입 맞추기)
  qty_ea integer not null default 0,

  lot_id uuid null,                     -- lots.id 연결 가능 (FEFO 쓰면 연결)
  memo text null,

  created_at timestamptz not null default now()
);

create index if not exists idx_shipment_items_shipment_id on public.shipment_items(shipment_id);
create index if not exists idx_shipment_items_variant_id on public.shipment_items(variant_id);

-- 6) 매출전표(장부) 헤더: 출고일 기준으로 기록
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  shipment_id uuid null references public.shipments(id) on delete set null,

  sale_date date not null,              -- 장부일자 = 출고일(원칙)
  supply_amount integer not null default 0,
  vat_amount integer not null default 0,
  total_amount integer not null default 0,

  status text not null default 'CONFIRMED', -- CONFIRMED/VOID 등
  memo text null,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

create index if not exists idx_sales_sale_date on public.sales(sale_date);
create index if not exists idx_sales_order_id on public.sales(order_id);

-- 7) 매출전표 라인(거래명세서/전표 출력 대비)
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,

  variant_id uuid not null,             -- product_variants.variant_id (타입 맞추기)
  qty_ea integer not null default 0,
  unit_price integer not null default 0,
  supply_amount integer not null default 0,
  vat_amount integer not null default 0,
  total_amount integer not null default 0,

  memo text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_sale_items_variant_id on public.sale_items(variant_id);

-- 8) 정산용 뷰(미수금이 낮아도 “장부/정산”에 매우 유용)
create or replace view public.v_order_balance as
select
  o.id as order_id,
  o.customer_name,
  o.title,
  o.ship_date,
  o.status,

  o.total_amount as order_total,

  coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0) as paid_total,
  coalesce((select sum(s.total_amount) from public.sales s where s.order_id = o.id and s.status <> 'VOID'), 0) as sold_total,

  (o.total_amount
   - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0)
  ) as balance_unpaid

from public.orders o;