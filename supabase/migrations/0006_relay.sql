-- Email relay (M6, Postmark): a person can switch a platform's relay address off. Mail to a
-- switched-off relay is dropped (the guide's open question; this is its default until decided).

alter table connections add column relay_off boolean not null default false;
