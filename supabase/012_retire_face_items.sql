-- DigiCommune: piercings and tattoos are removed (too small to see at this pixel size).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Requires 010_accessories.sql.
--
-- Anyone who bought a piercing, the tattoo, or a piercing/tattoo color gets those coins back.
-- The items become free (price 0) and "(retired)", so they disappear from the Shop and from
-- shop owners' stock lists. Their rows stay so old purchases still work.
-- Unsold stock of these items in player shops is refunded to the shop owner at the price paid.

-- Refund buyers (only while the items still have a price, so a re-run refunds nothing)
with refunds as (
  select inv.user_id, sum(i.price)::int as amount
  from public.inventory inv
  join public.items i on i.id = inv.item_id
  where i.category in ('face','faceColor') and i.price > 0
  group by inv.user_id
), paid as (
  update public.wallets w set balance = w.balance + r.amount
  from refunds r where w.user_id = r.user_id
  returning w.user_id, r.amount
)
insert into public.ledger (user_id, amount, reason, ref)
select user_id, amount, 'refund', 'retired piercings and tattoos' from paid;

-- Unsold shop stock of these items goes back to the shop owner
with stock as (
  select pr.owner_id as user_id, sum(s.quantity * s.paid_each)::int as amount
  from public.shop_stock s
  join public.items i on i.id = s.item_id
  join public.properties pr on pr.id = s.property_id
  where i.category in ('face','faceColor') and pr.owner_id is not null
  group by pr.owner_id
), paid as (
  update public.wallets w set balance = w.balance + st.amount
  from stock st where w.user_id = st.user_id and st.amount > 0
  returning w.user_id, st.amount
)
insert into public.ledger (user_id, amount, reason, ref)
select user_id, amount, 'shop_unstock', 'retired piercings and tattoos' from paid;

delete from public.shop_stock
where item_id in (select id from public.items where category in ('face','faceColor'));

update public.items
set price = 0, name = name || ' (retired)'
where category in ('face','faceColor') and price > 0;
